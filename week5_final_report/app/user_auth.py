from functools import wraps
import secrets
import sqlite3
import os
from flask import Flask, request, session
from flask_bcrypt import Bcrypt
from werkzeug.security import check_password_hash

# Import the app instance - we need to be careful about circular imports
app: Flask
bcrypt: Bcrypt


def set_app(flask_app, bcrypt_instance):
    global app, bcrypt
    app = flask_app
    bcrypt = bcrypt_instance
    print(f"DEBUG: set_app called, app is now: {app}")


def get_database():
    db_path = os.path.join(os.path.dirname(__file__), "../db.sqlite")
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    return db


# Simple token storage (in production, use Redis or database)
active_tokens = {}


def get_current_user():
    # Try session first
    if "user_id" in session:
        return {
            "id": session["user_id"],
            "username": session["username"],
            "role": session["role"],
        }

    # Try token-based auth as fallback
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        if token in active_tokens:
            user_data = active_tokens[token]
            return {
                "id": user_data["id"],
                "username": user_data["username"],
                "role": user_data["role"],
            }

    return {"message": "You have not been authenticated."}, 401


def privileged(access: str):
    assert access in {"r", "w", "a"}

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user_data = None

            # Try session first
            if "user_id" in session:
                user_data = {
                    "id": session["user_id"],
                    "username": session["username"],
                    "role": session["role"],
                }
            else:
                # Try token-based auth as fallback
                auth_header = request.headers.get("Authorization")
                if auth_header and auth_header.startswith("Bearer "):
                    token = auth_header.split(" ")[1]
                    if token in active_tokens:
                        user_data = active_tokens[token]

            if not user_data:
                return {"message": "You are not authorized."}, 401

            role = user_data["role"]
            match role:
                case "d":
                    return {"message": "Your authorization was revoked."}, 403
                case "r":
                    if access not in {"r"}:
                        return {"message": "You may not perform this operation."}, 403
                case "w":
                    if access not in {"r", "w"}:
                        return {"message": "You may not perform this operation."}, 403
                case "a":
                    pass
                case _:
                    assert False

            return func(*args, **kwargs)

        return wrapper

    return decorator


def login():
    data = request.get_json(force=True)
    if not data:
        return {"message": "A JSON body is required!"}, 400

    username = data.get("username")
    if not username:
        return {"message": "A username is required!"}, 400

    password = data.get("password")
    if not password:
        return {"message": "A password is required!"}, 400

    with get_database() as db:
        user = db.execute(
            """
            SELECT id, username, password_hash, role
            FROM users
            WHERE username = ?;
            """,
            (username,),
        ).fetchone()

    print(f"DEBUG: In login function, user: {user}")
    if user is None or not bcrypt.check_password_hash(user["password_hash"], password):
        return {"message": "Invalid credentials!"}, 401

    session.clear()
    # session.regenerate()
    session["user_id"] = user["id"]
    session["username"] = user["username"]
    session["role"] = user["role"]

    # Generate token as fallback
    token = secrets.token_urlsafe(32)
    active_tokens[token] = {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
    }

    print(f"Login session set: {dict(session)}")  # Debug session after setting
    print(f"Generated token: {token}")  # Debug token

    return {
        "message": "Logged in.",
        "user": {"id": user["id"], "username": user["username"], "role": user["role"]},
        "token": token,  # Include token in response
    }


def logout():
    session.clear()
    return {"message": "Logged out."}
