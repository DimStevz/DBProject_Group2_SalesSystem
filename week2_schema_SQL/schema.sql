DROP DATABASE IF EXISTS SalesSystem;
CREATE DATABASE SalesSystem;
USE SalesSystem;

CREATE TABLE Users(
    user_id INT NOT NULL,
    username VARCHAR(32) NOT NULL,
    password_hash CHAR(64) NOT NULL,
    role ENUM("secretary", "cashier", "admin") NOT NULL,

    PRIMARY KEY (user_id),
    UNIQUE (username)
);

CREATE TABLE Customers(
    customer_id INT NOT NULL,
    name VARCHAR(128) NOT NULL,
    email VARCHAR(64),
    phone VARCHAR(16),
    address VARCHAR(128),

    PRIMARY KEY (customer_id)
);

CREATE TABLE Sales(
    sale_id INT NOT NULL,
    sale_date DATE NOT NULL,
    customer_id INT NOT NULL,

    PRIMARY KEY (sale_id),
    FOREIGN KEY (customer_id) REFERENCES Customers(customer_id)
);

CREATE TABLE Categories(
    category_id INT NOT NULL,
    category_name VARCHAR(64) NOT NULL,
    description VARCHAR(128),

    PRIMARY KEY (category_id)
);

CREATE TABLE Products(
    product_id INT NOT NULL,
    name VARCHAR(64) NOT NULL,
    price NUMERIC(16, 2) NOT NULL,
    description VARCHAR(128),
    category_id INT NOT NULL,

    PRIMARY KEY (product_id),
    FOREIGN KEY (category_id) REFERENCES Categories(category_id)
);

CREATE TABLE InventoryLogs(
    log_id INT NOT NULL,
    log_type ENUM("restock", "purchase", "refund", "damage", "other") NOT NULL,
    quantity_delta INT NOT NULL,
    log_date DATE NOT NULL,
    product_id INT NOT NULL,

    PRIMARY KEY (log_id),
    FOREIGN KEY (product_id) REFERENCES Products(product_id)
);

CREATE TABLE SalesDetails(
    detail_id INT NOT NULL,
    unit_price NUMERIC(16, 2) NOT NULL,
    quantity INT NOT NULL,
    sale_id INT NOT NULL,
    log_id INT NOT NULL,
    product_id INT NOT NULL,

    PRIMARY KEY (detail_id),
    FOREIGN KEY (sale_id) REFERENCES Sales(sale_id),
    FOREIGN KEY (log_id) REFERENCES InventoryLogs(log_id),
    FOREIGN KEY (product_id) REFERENCES Products(product_id)
);
