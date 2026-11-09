
import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5000/api";

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [successOrder, setSuccessOrder] = useState(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API_URL}/products`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load products");
      }

      setProducts(data.products);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(price);

  const addToCart = (product) => {
    setError("");
    setSuccessOrder(null);

    setCart((currentCart) => {
      const existing = currentCart.find(
        (item) => item._id === product._id
      );

      if (existing) {
        if (existing.quantity >= product.stockCases) {
          setError(`Only ${product.stockCases} cases are available.`);
          return currentCart;
        }

        return currentCart.map((item) =>
          item._id === product._id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [
        ...currentCart,
        { ...product, quantity: 1 },
      ];
    });
  };

  const updateQuantity = (productId, change) => {
    setCart((currentCart) =>
      currentCart
        .map((item) => {
          if (item._id !== productId) return item;

          const nextQuantity = item.quantity + change;

          if (nextQuantity < 1) return null;

          if (nextQuantity > item.stockCases) {
            return item;
          }

          return { ...item, quantity: nextQuantity };
        })
        .filter(Boolean)
    );
  };

  const removeFromCart = (productId) => {
    setCart((currentCart) =>
      currentCart.filter((item) => item._id !== productId)
    );
  };

  const subtotal = cart.reduce(
    (total, item) =>
      total + item.dealerPrice * item.quantity,
    0
  );

  const placeOrder = async () => {
    if (cart.length === 0) return;

    try {
      setPlacingOrder(true);
      setError("");

      const response = await fetch(`${API_URL}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: cart.map((item) => ({
            productId: item._id,
            quantity: item.quantity,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to place order");
      }

      setSuccessOrder(data.order);
      setCart([]);

      await fetchProducts();
    } catch (err) {
      setError(err.message);
    } finally {
      setPlacingOrder(false);
    }
  };

  const filteredProducts = products.filter((product) =>
    `${product.name} ${product.sku} ${product.category}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div className="app">
      <header className="navbar">
        <div className="brand">
          <span className="brand-icon">S</span>
          <span>SmartWholesale</span>
        </div>

        <span className="role-label">RETAILER PORTAL</span>
      </header>

      <main className="container">
        <section className="welcome">
          <div>
            <p className="eyebrow">YOUR WHOLESALE STORE</p>
            <h1>Product Catalogue</h1>
            <p className="subtitle">
              Browse products, check prices and place orders.
            </p>
          </div>

          <div className="catalogue-count">
            <strong>{products.length}</strong>
            <span>Products</span>
          </div>
        </section>

        {error && (
          <div className="message error">
            {error}
          </div>
        )}

        {successOrder && (
          <div className="message success">
            <h3>Order placed successfully!</h3>
            <p>Order number: {successOrder.orderNumber}</p>
            <p>
              Total: {formatPrice(successOrder.subtotal)}
            </p>
            <p>Status: {successOrder.status}</p>
          </div>
        )}

        <section className="search-section">
          <input
            type="text"
            placeholder="Search by product name, SKU or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </section>

        {loading ? (
          <div className="message">Loading products...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="message">No products found.</div>
        ) : (
          <section className="product-grid">
            {filteredProducts.map((product) => (
              <article className="product-card" key={product._id}>
                <div className="product-top">
                  <span className="category">
                    {product.category}
                  </span>

                  <span
                    className={`stock ${
                      product.stockCases > 0 ? "available" : "out"
                    }`}
                  >
                    {product.stockCases > 0
                      ? "In Stock"
                      : "Out of Stock"}
                  </span>
                </div>

                <h2>{product.name}</h2>
                <p className="sku">{product.sku}</p>

                <div className="product-details">
                  <div>
                    <span className="detail-label">Pack size</span>
                    <strong>
                      {product.packSize} {product.packUnit}
                    </strong>
                  </div>

                  <div>
                    <span className="detail-label">Stock</span>
                    <strong>{product.stockCases} cases</strong>
                  </div>
                </div>

                <div className="product-footer">
                  <div>
                    <span className="detail-label">
                      Price / case
                    </span>
                    <strong className="price">
                      {formatPrice(product.dealerPrice)}
                    </strong>
                  </div>

                  <button
                    disabled={product.stockCases === 0}
                    onClick={() => addToCart(product)}
                  >
                    Add to Cart
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}

        <section className="cart-section">
          <div className="cart-heading">
            <div>
              <p className="eyebrow">YOUR SELECTION</p>
              <h2>Shopping Cart ({cart.length})</h2>
            </div>
          </div>

          {cart.length === 0 ? (
            <div className="empty-cart">
              Your cart is empty. Add products to get started.
            </div>
          ) : (
            <>
              <div className="cart-items">
                {cart.map((item) => (
                  <div className="cart-item" key={item._id}>
                    <div className="cart-product">
                      <strong>{item.name}</strong>
                      <span>{item.sku}</span>
                      <span>
                        {formatPrice(item.dealerPrice)} / case
                      </span>
                    </div>

                    <div className="quantity-controls">
                      <button
                        onClick={() => updateQuantity(item._id, -1)}
                        aria-label={`Decrease ${item.name} quantity`}
                      >
                        −
                      </button>

                      <strong>{item.quantity}</strong>

                      <button
                        onClick={() => updateQuantity(item._id, 1)}
                        disabled={item.quantity >= item.stockCases}
                        aria-label={`Increase ${item.name} quantity`}
                      >
                        +
                      </button>
                    </div>

                    <strong>
                      {formatPrice(item.dealerPrice * item.quantity)}
                    </strong>

                    <button
                      className="remove-button"
                      onClick={() => removeFromCart(item._id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="cart-total">
                <div>
                  <span>Subtotal</span>
                  <strong>{formatPrice(subtotal)}</strong>
                </div>

                <button
                  className="place-order-button"
                  disabled={placingOrder}
                  onClick={placeOrder}
                >
                  {placingOrder ? "Placing Order..." : "Place Order"}
                </button>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
