import logging
from logging import info, warning
import os

from dotenv import load_dotenv
from flask import Flask, request, session
from flask_bcrypt import Bcrypt
import sqlite3


load_dotenv()
app = Flask(__name__, static_folder="../static")
app.secret_key = os.environ.get("INVENTORY_DB_KEY", "debug_test")

# Configure session settings
app.config.update(
    SESSION_COOKIE_SECURE=False,  # Set to True in production with HTTPS
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)

bcrypt = Bcrypt(app)
logging.basicConfig(level=logging.INFO)


# Add CORS headers to all responses
@app.after_request
def after_request(response):
    # Allow credentials for same-origin requests
    origin = request.headers.get("Origin")
    if origin and origin.startswith("http://127.0.0.1"):
        response.headers.add("Access-Control-Allow-Origin", origin)
        response.headers.add("Access-Control-Allow-Credentials", "true")
    else:
        response.headers.add("Access-Control-Allow-Origin", "http://127.0.0.1:5000")
        response.headers.add("Access-Control-Allow-Credentials", "true")

    response.headers.add("Access-Control-Allow-Headers", "Content-Type,Authorization")
    response.headers.add(
        "Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,PATCH,OPTIONS"
    )
    return response


@app.get("/")
def root_page():
    return app.send_static_file("index.html")


def get_database():
    db_path = os.path.join(os.path.dirname(__file__), "../db.sqlite")
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    return db


@app.before_request
def init_database():
    # Only runs once
    app.before_request_funcs[None].remove(init_database)

    try:
        info("Initializing database...")
        with get_database() as db:
            # Use absolute path for schema file
            schema_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)), "schema.sql"
            )
            info(f"Looking for schema at: {schema_path}")
            with open(schema_path) as schema:
                db.executescript(schema.read())

            info("Schema loaded successfully")

            if (
                db.execute(
                    """
                    SELECT COUNT(*)
                    FROM users
                    WHERE users.role = 'a' OR users.username = "admin";
                    """
                ).fetchone()[0]
                == 0
            ):
                info("No admin account exists. Creating one...")
                db.execute(
                    """
                    INSERT INTO users(username, password_hash, role)
                    VALUES ("admin", ?, 'a');
                    """,
                    (bcrypt.generate_password_hash("admin").decode(),),
                )
                info(
                    "Please log into 'admin' with the password 'admin' and change the password."
                )

            db.commit()
            info("Database initialization completed successfully")
    except Exception as e:
        logging.error(f"Database initialization failed: {e}")
        raise


# Import all route modules to register them
from . import user_auth

user_auth.set_app(app, bcrypt)  # Pass both app and bcrypt

# Import other modules - they should automatically register routes when importing app
from . import users
from . import products
from . import categories
from . import customers
from . import sales
from . import logs

# Make user_auth globally accessible
_user_auth = user_auth


# Authentication route functions
def get_current_user_route():
    return _user_auth.get_current_user()


def login_route():
    return _user_auth.login()


def logout_route():
    return _user_auth.logout()


def register_routes():
    """Register all routes with the app."""

    # Register authentication routes first
    app.add_url_rule("/api/me", view_func=get_current_user_route, methods=["GET"])
    app.add_url_rule("/api/login", view_func=login_route, methods=["POST"])
    app.add_url_rule("/api/logout", view_func=logout_route, methods=["POST"])

    # Manually register products routes
    app.add_url_rule("/api/products", view_func=products.get_products, methods=["GET"])
    app.add_url_rule(
        "/api/products/<int:product_id>",
        view_func=products.get_product,
        methods=["GET"],
    )
    app.add_url_rule(
        "/api/products", view_func=products.create_product, methods=["POST"]
    )
    app.add_url_rule(
        "/api/products/<int:product_id>",
        view_func=products.update_product,
        methods=["PUT"],
    )
    app.add_url_rule(
        "/api/products/<int:product_id>",
        view_func=products.delete_product,
        methods=["DELETE"],
    )

    # Manually register users routes
    app.add_url_rule("/api/users", view_func=users.get_users, methods=["GET"])
    app.add_url_rule(
        "/api/users/<int:user_id>", view_func=users.get_user, methods=["GET"]
    )
    app.add_url_rule("/api/users", view_func=users.create_user, methods=["POST"])
    app.add_url_rule(
        "/api/users/<int:user_id>", view_func=users.update_user, methods=["PUT"]
    )
    app.add_url_rule(
        "/api/users/<int:user_id>", view_func=users.delete_user, methods=["DELETE"]
    )

    # Manually register categories routes
    app.add_url_rule(
        "/api/categories", view_func=categories.get_categories, methods=["GET"]
    )
    app.add_url_rule(
        "/api/categories/<int:category_id>",
        view_func=categories.get_category,
        methods=["GET"],
    )
    app.add_url_rule(
        "/api/categories", view_func=categories.create_category, methods=["POST"]
    )
    app.add_url_rule(
        "/api/categories/<int:category_id>",
        view_func=categories.update_category,
        methods=["PUT"],
    )
    app.add_url_rule(
        "/api/categories/<int:category_id>",
        view_func=categories.delete_category,
        methods=["DELETE"],
    )

    # Manually register customers routes
    app.add_url_rule(
        "/api/customers", view_func=customers.get_customers, methods=["GET"]
    )
    app.add_url_rule(
        "/api/customers/<int:customer_id>",
        view_func=customers.get_customer,
        methods=["GET"],
    )
    app.add_url_rule(
        "/api/customers", view_func=customers.create_customer, methods=["POST"]
    )
    app.add_url_rule(
        "/api/customers/<int:customer_id>",
        view_func=customers.update_customer,
        methods=["PUT"],
    )
    app.add_url_rule(
        "/api/customers/<int:customer_id>",
        view_func=customers.delete_customer,
        methods=["DELETE"],
    )

    # Manually register sales routes
    app.add_url_rule("/api/sales", view_func=sales.get_sales, methods=["GET"])
    app.add_url_rule(
        "/api/sales/<int:sale_id>", view_func=sales.get_sale, methods=["GET"]
    )
    app.add_url_rule("/api/sales", view_func=sales.create_sale, methods=["POST"])
    app.add_url_rule(
        "/api/sales/<int:sale_id>", view_func=sales.delete_sale, methods=["DELETE"]
    )

    # Manually register logs routes
    app.add_url_rule("/api/logs", view_func=logs.get_logs, methods=["GET"])
    app.add_url_rule("/api/logs/<int:log_id>", view_func=logs.get_log, methods=["GET"])
    app.add_url_rule("/api/logs", view_func=logs.create_log, methods=["POST"])
    app.add_url_rule(
        "/api/logs/<int:log_id>", view_func=logs.update_log, methods=["PUT"]
    )
    app.add_url_rule(
        "/api/logs/<int:log_id>", view_func=logs.delete_log, methods=["DELETE"]
    )


# Call register_routes to set up all the routes when the module is imported
register_routes()


if __name__ == "__main__":
    print("Starting Inventory Management System...")
    print("Available at: http://127.0.0.1:5000")
    print("Login with username: admin, password: admin")

    # Register all routes
    print("Registering route modules...")
    register_routes()
    print("Route modules imported and configured...")

    # Manually register the login routes
    app.add_url_rule("/api/me", view_func=get_current_user_route, methods=["GET"])
    app.add_url_rule("/api/login", view_func=login_route, methods=["POST"])
    app.add_url_rule("/api/logout", view_func=logout_route, methods=["POST"])

    print("  - Authentication routes registered manually")

    # Print available routes
    print("Available API routes:")
    for rule in app.url_map.iter_rules():
        if "/api/" in rule.rule:
            print(
                f"  {rule.rule} - {[] if rule.methods is None else list(rule.methods)}"
            )

    app.run(debug=True, port=5000, use_reloader=False)
