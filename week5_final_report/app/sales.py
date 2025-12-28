from .app import *
from . import user_auth

privileged = user_auth.privileged
active_tokens = user_auth.active_tokens


@app.get("/api/sales")
@privileged("r")
def get_sales():
    with get_database() as db:
        rows = db.execute(
            """
            SELECT s.id, s.time, s.total_cents, s.customer_id, s.user_id,
                   c.name as customer_name
            FROM sales s
                LEFT JOIN customers c ON s.customer_id = c.id
            ORDER BY s.time DESC;
            """
        ).fetchall()

        sales_list = []
        for row in rows:
            sale = dict(row)

            # Get sale details with product information
            details = db.execute(
                """
                SELECT sd.subtotal_cents, sd.note, il.product_id, -il.delta AS quantity,
                       p.name as product_name, p.price_cents as unit_price_cents
                FROM sales_details sd
                    LEFT JOIN inventory_logs il ON sd.log_id = il.id
                    LEFT JOIN products p ON il.product_id = p.id
                WHERE sd.sale_id = ?
                ORDER BY sd.id;
                """,
                (row["id"],),
            ).fetchall()

            sale["details"] = [dict(detail) for detail in details]
            sales_list.append(sale)

    return sales_list


@app.get("/api/sales/<int:sale_id>")
@privileged("r")
def get_sale(sale_id):
    with get_database() as db:
        head = db.execute(
            """
            SELECT id, time, total_cents, customer_id, user_id
            FROM sales
            WHERE id = ?;
            """,
            (sale_id,),
        ).fetchone()

        if head is None:
            return {"message": "Sale is not found!"}, 404

        details = db.execute(
            """
            SELECT sd.subtotal_cents, sd.log_id, sd.note, il.product_id, -il.delta AS quantity,
                   p.name as product_name, p.price_cents as unit_price_cents, p.sku
            FROM sales_details sd
                LEFT JOIN inventory_logs il ON sd.log_id = il.id
                LEFT JOIN products p ON il.product_id = p.id
            WHERE sd.sale_id = ?
            ORDER BY sd.id;
            """,
            (sale_id,),
        ).fetchall()

    return {
        "id": head["id"],
        "time": head["time"],
        "total_cents": head["total_cents"],
        "customer_id": head["customer_id"],
        "user_id": head["user_id"],
        "details": [dict(row) for row in details],
    }


@app.post("/api/sales")
@privileged("w")
def create_sale():
    data = request.get_json(force=True)
    print(f"Received sales data: {data}")  # Debug log
    if not data:
        return {"message": "A JSON body is required!"}, 400

    customer_id = data.get("customer_id")
    if not customer_id:
        return {"message": "A customer is required!"}, 400

    details = data.get("details")
    if not details or not isinstance(details, list):
        return {"message": "A non-empty list of details is required!"}, 400

    # Get user ID from session or token
    user_id = None
    if "user_id" in session:
        user_id = session["user_id"]
    else:
        # Try token-based auth
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            if token in active_tokens:
                user_id = active_tokens[token]["id"]

    if not user_id:
        return {"message": "User authentication failed."}, 401

    with get_database() as db:
        try:
            print(f"Using user_id: {user_id}")  # Debug log
            cursor = db.execute(
                """
                INSERT INTO sales (customer_id, user_id)
                VALUES (?, ?);
                """,
                (customer_id, user_id),
            )
            sale_id = cursor.lastrowid

            for item in details:
                product_id = item.get("product_id")
                quantity = item.get("quantity")
                subtotal = item.get("subtotal_cents")
                note = item.get("note")

                if not subtotal:
                    return {"message": "Each detail requires a subtotal!"}, 400

                log_id = None
                if product_id:
                    if not quantity:
                        return {
                            "message": "Each detail that contains inventory change must have a quantity!"
                        }, 400

                    log_cur = db.execute(
                        """
                        INSERT INTO inventory_logs (type, product_id, delta, note)
                        VALUES ('s', ?, ?, ?);
                        """,
                        (
                            product_id,
                            -quantity,
                            f"Automatic logging from sale #{sale_id}: {note}",
                        ),
                    )
                    log_id = log_cur.lastrowid

                db.execute(
                    """
                    INSERT INTO sales_details (subtotal_cents, sale_id, log_id, note)
                    VALUES (?, ?, ?, ?);
                    """,
                    (subtotal, sale_id, log_id, note),
                )
        except sqlite3.IntegrityError as exc:
            print(f"SQLite IntegrityError: {exc}")  # Debug log
            msg = str(exc).lower()
            if "customer_id" in msg:
                return {"message": "Customer does not exist!"}, 400
            if "product_id" in msg:
                return {"message": "Product does not exist!"}, 400
            return {"message": "Invalid input or constraint violation!"}, 400
        except Exception as exc:
            print(f"Unexpected error: {exc}")  # Debug log
            return {"message": f"Server error: {str(exc)}"}, 500

    return {"message": "Sale has been created.", "id": sale_id}, 201


@app.patch("/api/sales/<int:sale_id>")
@privileged("w")
def update_sale(sale_id):
    data = request.get_json(force=True)
    if not data:
        return {"message": "A JSON body is required!"}, 400

    with get_database() as db:
        # Check if sale exists
        sale = db.execute("SELECT id FROM sales WHERE id = ?", (sale_id,)).fetchone()

        if not sale:
            return {"message": "Sale not found!"}, 404

        # Update allowed fields
        updates = []
        params = []

        if "customer_id" in data:
            updates.append("customer_id = ?")
            params.append(data["customer_id"])

        if not updates:
            return {"message": "No valid fields to update!"}, 400

        params.append(sale_id)

        try:
            db.execute(f"UPDATE sales SET {', '.join(updates)} WHERE id = ?", params)
            db.commit()
        except sqlite3.IntegrityError as exc:
            msg = str(exc).lower()
            if "customer_id" in msg:
                return {"message": "Customer does not exist!"}, 400
            return {"message": "Invalid input or constraint violation!"}, 400
        except Exception as exc:
            return {"message": f"Server error: {str(exc)}"}, 500

    return {"message": "Sale has been updated."}, 200


@app.delete("/api/sales/<int:sale_id>")
@privileged("a")
def delete_sale(sale_id):
    with get_database() as db:
        rows = db.execute(
            """
            SELECT log_id
            FROM sales_details
            WHERE sale_id = ?;
            """,
            (sale_id,),
        ).fetchall()

        log_ids = [row["log_id"] for row in rows if row["log_id"] is not None]
        if log_ids:
            db.execute(
                f"""
                DELETE FROM inventory_logs
                WHERE id IN ({','.join('?' * len(log_ids))});
                """,
                tuple(log_ids),
            )

        db.execute(
            """
            DELETE FROM sales_details
            WHERE sale_id = ?;
            """,
            (sale_id,),
        )

        result = db.execute(
            """
            DELETE FROM sales
            WHERE id = ?;
            """,
            (sale_id,),
        )

        if result.rowcount == 0:
            return {"message": "Sale is not found!"}, 404

    return {"message": "Sale has been deleted."}
