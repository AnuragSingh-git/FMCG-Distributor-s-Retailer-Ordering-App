
import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5000/api/products";

function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch(API_URL);
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

    fetchProducts();
  }, []);

  const filteredProducts = products.filter((product) =>
    `${product.name} ${product.sku} ${product.category}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const formatPrice = (price) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(price);

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
              Browse products, check dealer prices and stock availability.
            </p>
          </div>
          <div className="catalogue-count">
            <strong>{products.length}</strong>
            <span>Products</span>
          </div>
        </section>

        <section className="search-section">
          <input
            type="text"
            placeholder="Search products by name, SKU or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </section>

        {loading && (
          <div className="message">Loading products...</div>
        )}

        {error && (
          <div className="message error">
            {error}. Please check whether the backend is running.
          </div>
        )}

        {!loading && !error && filteredProducts.length === 0 && (
          <div className="message">
            No products found. Try another search.
          </div>
        )}

        {!loading && !error && filteredProducts.length > 0 && (
          <section className="product-grid">
            {filteredProducts.map((product) => (
              <article className="product-card" key={product._id}>
                <div className="product-top">
                  <span className="category">{product.category}</span>
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
                    <span className="detail-label">Available stock</span>
                    <strong>{product.stockCases} cases</strong>
                  </div>
                </div>

                <div className="product-footer">
                  <div>
                    <span className="detail-label">Dealer price / case</span>
                    <strong className="price">
                      {formatPrice(product.dealerPrice)}
                    </strong>
                  </div>
                  <button
                    disabled={product.stockCases === 0}
                    onClick={() =>
                      alert(`${product.name} will be added to cart soon!`)
                    }
                  >
                    {product.stockCases === 0 ? "Unavailable" : "Add to Cart"}
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
