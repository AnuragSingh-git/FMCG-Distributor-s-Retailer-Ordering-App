import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "/api";
const waNumber = String(import.meta.env.VITE_WHATSAPP_NUMBER || "").replace(/\D/g, "");
const formatPrice = (price) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(price || 0);

function App() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem("company-a-session") || "null"); } catch { return null; }
  });
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [successOrder, setSuccessOrder] = useState(null);
  const [captureText, setCaptureText] = useState("");
  const [interpreting, setInterpreting] = useState(false);
  const [interpretation, setInterpretation] = useState(null);
  const [whatsappReady, setWhatsappReady] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  const authHeaders = () => session?.token ? { Authorization: `Bearer ${session.token}` } : {};

  const fetchProducts = async () => {
    try {
      setLoading(true); setError("");
      const response = await fetch(`${API_URL}/products`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to load products");
      setProducts(data.products);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!session?.token) return;
    let active = true;
    fetch(`${API_URL}/products`).then((r) => r.json()).then((data) => {
      if (!active) return;
      if (data.success) setProducts(data.products); else setError(data.message || "Unable to load products");
    }).catch((err) => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    fetch(`${API_URL}/whatsapp/status`, { headers: { Authorization: `Bearer ${session.token}` } }).then((r) => r.json()).then((d) => { if (active) setWhatsappReady(Boolean(d.configured)); }).catch(() => { if (active) setWhatsappReady(false); });
    return () => { active = false; };
  }, [session?.token]);

  const submitAuth = async (event) => {
    event.preventDefault(); setError(""); setNotice("");
    try {
      const response = await fetch(`${API_URL}/auth/${authMode === "register" ? "register" : "login"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(authForm) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to sign in");
      const next = { token: data.token, user: data.user };
      localStorage.setItem("company-a-session", JSON.stringify(next)); setLoading(true); setSession(next);
    } catch (err) { setError(err.message); }
  };

  const signOut = () => { localStorage.removeItem("company-a-session"); setSession(null); setCart([]); setProducts([]); setInterpretation(null); };

  const saveWhatsAppPhone = async () => {
    setSavingPhone(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${API_URL}/auth/phone`, { method: "PATCH", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ phone: phoneDraft }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to save phone number");
      const next = { ...session, user: { ...session.user, phone: data.phone } };
      localStorage.setItem("company-a-session", JSON.stringify(next)); setSession(next); setNotice("WhatsApp number saved. Incoming orders from this number will need order-desk review."); setPhoneDraft("");
    } catch (err) { setError(err.message); }
    finally { setSavingPhone(false); }
  };

  const addToCart = (product, quantity = 1) => {
    setError(""); setSuccessOrder(null);
    setCart((current) => {
      const existing = current.find((item) => item._id === product._id);
      const nextQuantity = (existing?.quantity || 0) + quantity;
      if (nextQuantity > product.stockCases) { setError(`Only ${product.stockCases} cases of ${product.name} are available.`); return current; }
      return existing ? current.map((item) => item._id === product._id ? { ...item, quantity: nextQuantity } : item) : [...current, { ...product, quantity }];
    });
  };

  const updateQuantity = (productId, change) => setCart((current) => current.map((item) => {
    if (item._id !== productId) return item;
    const next = item.quantity + change;
    return next < 1 || next > item.stockCases ? item : { ...item, quantity: next };
  }));
  const removeFromCart = (productId) => setCart((current) => current.filter((item) => item._id !== productId));
  const subtotal = cart.reduce((total, item) => total + item.dealerPrice * item.quantity, 0);
  const filteredProducts = useMemo(() => products.filter((product) => `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(search.toLowerCase())), [products, search]);

  const interpretOrder = async () => {
    setInterpreting(true); setError(""); setInterpretation(null);
    try {
      const response = await fetch(`${API_URL}/ai/parse-order`, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ message: captureText }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Gemini could not read this order");
      setInterpretation(data.interpretation);
    } catch (err) { setError(err.message); }
    finally { setInterpreting(false); }
  };

  const addInterpretation = () => {
    const lines = interpretation?.items || [];
    let rejected = 0;
    lines.forEach((line) => {
      const product = products.find((item) => item._id === line.productId);
      if (!product || product.stockCases < line.quantity || line.quantity < 1) { rejected += 1; return; }
      addToCart(product, line.quantity);
    });
    if (rejected) setNotice(`${rejected} line(s) could not be added because of stock or catalogue changes.`);
    else setNotice("Matched lines added. Review your cart and place the order when ready.");
    setInterpretation(null);
  };

  const placeOrder = async () => {
    if (!cart.length) return;
    try {
      setPlacingOrder(true); setError(""); setNotice("");
      const response = await fetch(`${API_URL}/orders`, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ items: cart.map((item) => ({ productId: item._id, quantity: item.quantity })) }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to place order");
      setSuccessOrder(data.order); setCart([]); await fetchProducts();
      setNotice("Order sent to Company A’s order desk for review.");
    } catch (err) { setError(err.message); }
    finally { setPlacingOrder(false); }
  };

  if (!session?.token) return <div className="auth-page"><form className="auth-card" onSubmit={submitAuth}>
    <div className="brand"><span className="brand-icon">A</span><span>Company A</span></div>
    <p className="eyebrow">JABALPUR · RETAILER ORDERING</p><h1>{authMode === "register" ? "Create your account" : "Welcome back"}</h1>
    <p className="subtitle">Sign in to view your catalogue and send an order.</p>
    {error && <div className="message error">{error}</div>}
    {authMode === "register" && <label>Shop / owner name<input required maxLength="80" value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} /></label>}
    <label>Email<input required type="email" autoComplete="email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} /></label>
    <label>Password<input required type="password" minLength="8" autoComplete={authMode === "register" ? "new-password" : "current-password"} value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} /></label>
    {authMode === "register" && <label>WhatsApp mobile (with country code, e.g. +91)<input type="tel" autoComplete="tel" value={authForm.phone} onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })} /></label>}
    <button className="place-order-button auth-submit">{authMode === "register" ? "Create retailer account" : "Sign in"}</button>
    <p className="auth-switch">{authMode === "register" ? "Already registered?" : "New retailer?"} <button type="button" onClick={() => { setAuthMode(authMode === "register" ? "login" : "register"); setError(""); }}> {authMode === "register" ? "Sign in" : "Create an account"}</button></p>
  </form></div>;

  return <div className="app">
    <header className="navbar"><div className="brand"><span className="brand-icon">A</span><span>Company A</span></div><div className="header-actions"><span className="role-label">RETAILER PORTAL</span><span className="signed-in">{session.user?.name}</span><button className="signout" onClick={signOut}>Sign out</button></div></header>
    <main className="container">
      <section className="welcome"><div><p className="eyebrow">YOUR WHOLESALE STORE</p><h1>Product Catalogue</h1><p className="subtitle">Browse products, check prices and place orders.</p></div><div className="catalogue-count"><strong>{products.length}</strong><span>Products</span></div></section>
      {error && <div className="message error">{error}</div>}
      {notice && <div className="message success">{notice}</div>}
      {successOrder && <div className="message success"><h3>Order placed successfully</h3><p>Order number: {successOrder.orderNumber}</p><p>Total: {formatPrice(successOrder.subtotal)}</p><p>Status: {successOrder.status}</p></div>}

      <section className="capture-panel">
        <div className="capture-intro"><div><p className="eyebrow">QUICK ORDER</p><h2>Message your order</h2><p>Type the way you’d WhatsApp it. Gemini matches items for you to review.</p></div>{waNumber ? <a className="whatsapp-button" href={`https://wa.me/${waNumber}?text=${encodeURIComponent("Namaste, I would like to place an order: ")}`} target="_blank" rel="noreferrer"><span>◉</span> Order on WhatsApp</a> : <span className="integration-badge">WhatsApp Cloud API {whatsappReady ? "configured" : "not configured"}</span>}</div>
        <div className="phone-link-row">{session.user?.phone ? <span>Incoming order number: <strong>+{session.user.phone}</strong></span> : <><label htmlFor="wa-phone">Link the mobile number you’ll message Company A from</label><input id="wa-phone" type="tel" placeholder="+91 98765 43210" value={phoneDraft} onChange={(e) => setPhoneDraft(e.target.value)} /><button onClick={saveWhatsAppPhone} disabled={savingPhone || !phoneDraft.trim()}>{savingPhone ? "Saving…" : "Save number"}</button></>}</div>
        <textarea className="order-message" value={captureText} onChange={(e) => setCaptureText(e.target.value)} placeholder="5 peti biscuit chhota, 2 peti washing powder 1 kilo, chai patti 250 wala 1 peti" maxLength={2000} />
        <button className="interpret-button" onClick={interpretOrder} disabled={interpreting || !captureText.trim()}>{interpreting ? "Gemini is reading…" : "Interpret order with Gemini"}</button>
        {interpretation && <div className="interpretation"><h3>Check the interpreted items</h3><p className="review-note">Nothing is ordered until you add the matches, review your basket, and place the order.</p>
          {interpretation.items.map((line, index) => <div className="interpreted-line" key={`${line.sku}-${index}`}><div><strong>{line.quantity} × {line.name}</strong><small>{line.sku} · {Math.round(line.confidence * 100)}% match · {line.stockCases} cases available</small>{line.clarification && <small>{line.clarification}</small>}</div><span className={line.needsReview ? "review-flag" : "match-flag"}>{line.needsReview ? "Check" : "Matched"}</span></div>)}
          {interpretation.unmatched.map((text, index) => <div className="unmatched-line" key={index}>Couldn’t match: “{text}” — check the text or ask the order desk.</div>)}
          {!interpretation.items.length && <div className="unmatched-line">No catalogue matches found. Try a product name and case quantity.</div>}
          {interpretation.items.length > 0 && <button className="add-interpreted" onClick={addInterpretation}>Add matches to cart</button>}
        </div>}
      </section>

      <section className="search-section"><input type="text" placeholder="Search by product name, SKU or category..." value={search} onChange={(e) => setSearch(e.target.value)} /></section>
      {loading ? <div className="message">Loading products...</div> : filteredProducts.length === 0 ? <div className="message">No products found.</div> : <section className="product-grid">{filteredProducts.map((product) => <article className="product-card" key={product._id}>
        <div className="product-top"><span className="category">{product.category}</span><span className={`stock ${product.stockCases > 0 ? "available" : "out"}`}>{product.stockCases > 0 ? `${product.stockCases} cases in stock` : "Out of Stock"}</span></div>
        <h2>{product.name}</h2><p className="sku">{product.sku}</p>
        <div className="product-details"><div><span className="detail-label">Pack size</span><strong>{product.packSize} {product.packUnit}</strong></div><div><span className="detail-label">Stock</span><strong>{product.stockCases} cases</strong></div></div>
        <div className="product-footer"><div><span className="detail-label">Price / case</span><strong className="price">{formatPrice(product.dealerPrice)}</strong><span className="detail-label">GST: confirm on invoice</span></div><button disabled={product.stockCases === 0} onClick={() => addToCart(product)}>Add to Cart</button></div>
      </article>)}</section>}

      <section className="cart-section"><div className="cart-heading"><div><p className="eyebrow">YOUR SELECTION</p><h2>Shopping Cart ({cart.length})</h2></div></div>
        {cart.length === 0 ? <div className="empty-cart">Your cart is empty. Add products or review a Gemini match to get started.</div> : <><div className="cart-items">{cart.map((item) => <div className="cart-item" key={item._id}><div className="cart-product"><strong>{item.name}</strong><span>{item.sku}</span><span>{formatPrice(item.dealerPrice)} / case</span></div><div className="quantity-controls"><button onClick={() => updateQuantity(item._id, -1)} aria-label={`Decrease ${item.name} quantity`}>−</button><strong>{item.quantity}</strong><button onClick={() => updateQuantity(item._id, 1)} disabled={item.quantity >= item.stockCases} aria-label={`Increase ${item.name} quantity`}>+</button></div><strong>{formatPrice(item.dealerPrice * item.quantity)}</strong><button className="remove-button" onClick={() => removeFromCart(item._id)}>Remove</button></div>)}</div><div className="cart-total"><div><span>Subtotal estimate</span><strong>{formatPrice(subtotal)}</strong></div><button className="place-order-button" disabled={placingOrder} onClick={placeOrder}>{placingOrder ? "Placing Order..." : "Review and Place Order"}</button></div><p className="order-review-footnote">GST and any applicable schemes are confirmed by Company A’s order desk.</p></>}
      </section>
    </main>
  </div>;
}

export default App;
