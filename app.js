// ============================================================
//  EveResT — app.js
//  Full frontend logic: Supabase auth, products, cart, orders
// ============================================================

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ────────────────────────────────────────────────────
let allProducts = [];
let cart = JSON.parse(localStorage.getItem('everest_cart') || '[]');
let currentUser = null;
let currentProduct = null;
let selectedSize = null;
let activeFilter = 'all';
let searchQuery = '';

// ── DOM refs ─────────────────────────────────────────────────
const productGrid    = document.getElementById('product-grid');
const productCount   = document.getElementById('product-count');
const cartBadge      = document.getElementById('cart-badge');
const cartItems      = document.getElementById('cart-items');
const cartTotal      = document.getElementById('cart-total');
const userBtn        = document.getElementById('user-btn');
const searchInput    = document.getElementById('search-input');
const searchBar      = document.getElementById('search-bar');

// ── Init ─────────────────────────────────────────────────────
(async () => {
  setupAuth();
  setupNav();
  setupCart();
  setupModals();
  setupSearch();
  setupCategories();
  await loadProducts();
  updateCartUI();
})();

// ── AUTH ─────────────────────────────────────────────────────
function setupAuth() {
  db.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    renderUserBtn();
  });

  document.getElementById('auth-close').onclick = closeAuth;
  document.getElementById('auth-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('auth-overlay')) closeAuth();
  });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('panel-login').classList.toggle('hidden', tab !== 'login');
      document.getElementById('panel-signup').classList.toggle('hidden', tab !== 'signup');
    });
  });

  // Login
  document.getElementById('login-btn').onclick = async () => {
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-password').value;
    const err   = document.getElementById('login-error');
    err.textContent = '';
    if (!email || !pass) { err.textContent = 'Please fill in all fields.'; return; }
    const { error } = await db.auth.signInWithPassword({ email, password: pass });
    if (error) { err.textContent = error.message; return; }
    closeAuth();
  };

  // Signup
  document.getElementById('signup-btn').onclick = async () => {
    const name  = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const pass  = document.getElementById('signup-password').value;
    const err   = document.getElementById('signup-error');
    err.textContent = '';
    if (!name || !email || !pass) { err.textContent = 'Please fill in all fields.'; return; }
    if (pass.length < 6) { err.textContent = 'Password must be at least 6 characters.'; return; }
    const { data, error } = await db.auth.signUp({
      email, password: pass,
      options: { data: { full_name: name } }
    });
    if (error) { err.textContent = error.message; return; }
    // Insert into customers table
    if (data.user) {
      await db.from('customers').upsert({ id: data.user.id, email, full_name: name });
    }
    closeAuth();
    alert('Account created! Please check your email to confirm.');
  };
}

function renderUserBtn() {
  if (currentUser) {
    const name = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
    userBtn.textContent = name.split(' ')[0];
    userBtn.onclick = showUserMenu;
  } else {
    userBtn.textContent = 'Login';
    userBtn.onclick = openAuth;
  }
}

function openAuth()  { document.getElementById('auth-overlay').classList.remove('hidden'); }
function closeAuth() { document.getElementById('auth-overlay').classList.add('hidden'); }

function showUserMenu() {
  const choice = confirm(`Logged in as ${currentUser.email}\n\nClick OK to view Orders, Cancel to Logout.`);
  if (choice) openOrders();
  else db.auth.signOut();
}

// ── PRODUCTS ─────────────────────────────────────────────────
async function loadProducts() {
  const { data, error } = await db.from('products').select('*').eq('active', true).order('created_at', { ascending: false });
  if (error || !data) {
    // Fallback demo products if DB not connected yet
    allProducts = getDemoProducts();
  } else {
    allProducts = data;
  }
  renderProducts();
  updateCategoryCounts();
}

function getDemoProducts() {
  return [
    { id: 1, name: 'Summit Oversized Hoodie', category: 'outerwear', price: 2400, stock: 15, sizes: ['S','M','L','XL'], tag: 'new', emoji: '🧥', description: 'Premium heavyweight cotton blend. Dropped shoulders, kangaroo pocket, embroidered EveResT badge.' },
    { id: 2, name: 'Altitude Utility Jacket', category: 'outerwear', price: 4200, stock: 8,  sizes: ['S','M','L','XL'], tag: 'hot', emoji: '🫱', description: 'Multi-pocket technical jacket. Water-resistant shell, removable hood, reflective branding.' },
    { id: 3, name: 'Peak Logo Heavy Tee',     category: 'tops',      price: 980,  stock: 30, sizes: ['XS','S','M','L','XL'], tag: '', emoji: '👕', description: '280gsm heavyweight cotton. Oversized fit, chest logo print, ribbed collar.' },
    { id: 4, name: 'Basecamp Cargo Pants',    category: 'bottoms',   price: 2100, stock: 12, sizes: ['S','M','L','XL'], tag: 'new', emoji: '👖', description: 'Six-pocket cargo silhouette. Relaxed fit, adjustable waistband, twill fabric.' },
    { id: 5, name: 'Ridge Puffer Vest',       category: 'outerwear', price: 1960, stock: 5,  sizes: ['S','M','L'],        tag: 'sale', emoji: '🦺', description: 'Lightweight puffer vest. Down-feel fill, internal pocket, EveResT woven label.' },
    { id: 6, name: 'Cloud Layer Sweater',     category: 'tops',      price: 1650, stock: 20, sizes: ['S','M','L','XL'], tag: '', emoji: '🩲', description: 'Brushed fleece interior. Crewneck, dropped hem, tonal embroidery.' },
    { id: 7, name: 'EveResT Six-Panel Cap',   category: 'accessories',price: 650, stock: 40, sizes: ['One Size'],         tag: 'new', emoji: '🧢', description: 'Structured six-panel cap. Embroidered peak logo, adjustable strap, tan undervisor.' },
    { id: 8, name: 'Urban Trail Backpack',    category: 'accessories',price: 3100, stock: 7, sizes: ['One Size'],         tag: '', emoji: '🎒', description: '25L capacity. Laptop sleeve, top carry handle, padded straps, EveResT rubber badge.' },
  ];
}

function renderProducts() {
  let filtered = allProducts.filter(p => {
    const matchFilter = activeFilter === 'all' || p.category === activeFilter;
    const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchFilter && matchSearch;
  });

  productCount.textContent = `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    productGrid.innerHTML = `<div style="grid-column:1/-1;padding:4rem 0;text-align:center;color:var(--muted);font-size:0.9rem;">No products found.</div>`;
    return;
  }

  productGrid.innerHTML = filtered.map(p => {
    const oldPrice = p.tag === 'sale' ? `<span class="old-price">EGP ${(p.price * 1.3).toFixed(0)}</span>` : '';
    const priceDisplay = p.tag === 'sale'
      ? `${oldPrice}<span class="sale-price">EGP ${p.price.toLocaleString()}</span>`
      : `EGP ${p.price.toLocaleString()}`;
    const tagHtml = p.tag ? `<span class="card-tag tag-${p.tag}">${p.tag}</span>` : '';
    const imgHtml = p.image_url
      ? `<img src="${p.image_url}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;"/>`
      : `<div class="product-emoji">${p.emoji || '👕'}</div>`;
    return `
      <div class="product-card" data-id="${p.id}">
        <div class="product-img">
          ${tagHtml}
          ${imgHtml}
          <div class="card-overlay"><button class="quick-view">Quick View</button></div>
        </div>
        <div class="card-info">
          <div class="card-cat">${p.category}</div>
          <div class="card-name">${p.name}</div>
          <div class="card-price">${priceDisplay}</div>
        </div>
      </div>`;
  }).join('');

  // Events
  productGrid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => openProduct(card.dataset.id));
  });
}

function updateCategoryCounts() {
  ['tops','outerwear','bottoms','accessories'].forEach(cat => {
    const el = document.getElementById(`cnt-${cat}`);
    if (el) el.textContent = allProducts.filter(p => p.category === cat).length + ' items';
  });
}

// ── PRODUCT MODAL ────────────────────────────────────────────
function openProduct(id) {
  currentProduct = allProducts.find(p => String(p.id) === String(id));
  if (!currentProduct) return;
  selectedSize = null;

  document.getElementById('modal-cat').textContent   = currentProduct.category;
  document.getElementById('modal-name').textContent  = currentProduct.name;
  document.getElementById('modal-desc').textContent  = currentProduct.description || '';
  document.getElementById('modal-price').textContent = `EGP ${currentProduct.price.toLocaleString()}`;
  document.getElementById('modal-img').innerHTML = currentProduct.image_url
    ? `<img src="${currentProduct.image_url}" alt="${currentProduct.name}" style="width:100%;height:100%;object-fit:cover;min-height:400px;"/>`
    : `<div style="font-size:6rem;opacity:0.6">${currentProduct.emoji || '👕'}</div>`;

  const stock = currentProduct.stock || 0;
  const stockEl = document.getElementById('modal-stock');
  stockEl.textContent = stock <= 5 ? `Only ${stock} left!` : `${stock} in stock`;
  stockEl.className = 'modal-stock' + (stock <= 5 ? ' low' : '');

  const sizes = currentProduct.sizes || ['S','M','L','XL'];
  document.getElementById('size-grid').innerHTML = sizes.map(s =>
    `<button class="size-btn" data-size="${s}">${s}</button>`
  ).join('');

  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedSize = btn.dataset.size;
    });
  });

  // Auto-select if only one size
  if (sizes.length === 1) {
    document.querySelector('.size-btn')?.classList.add('selected');
    selectedSize = sizes[0];
  }

  document.getElementById('product-overlay').classList.remove('hidden');
}

function setupModals() {
  document.getElementById('product-close').onclick  = () => document.getElementById('product-overlay').classList.add('hidden');
  document.getElementById('product-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('product-overlay')) document.getElementById('product-overlay').classList.add('hidden');
  });

  document.getElementById('modal-add-btn').onclick = () => {
    if (!selectedSize) { alert('Please select a size.'); return; }
    addToCart(currentProduct, selectedSize);
    document.getElementById('product-overlay').classList.add('hidden');
  };

  document.getElementById('orders-close').onclick  = () => document.getElementById('orders-overlay').classList.add('hidden');
  document.getElementById('orders-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('orders-overlay')) document.getElementById('orders-overlay').classList.add('hidden');
  });
}

// ── CART ─────────────────────────────────────────────────────
function setupCart() {
  document.getElementById('cart-btn').onclick    = openCart;
  document.getElementById('cart-close').onclick  = closeCart;
  document.getElementById('cart-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('cart-overlay')) closeCart();
  });
  document.getElementById('checkout-btn').onclick = handleCheckout;
}

function addToCart(product, size) {
  const key = `${product.id}-${size}`;
  const existing = cart.find(i => i.key === key);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ key, id: product.id, name: product.name, price: product.price, emoji: product.emoji || '👕', size, qty: 1 });
  }
  saveCart();
  updateCartUI();
  openCart();
}

function removeFromCart(key) {
  cart = cart.filter(i => i.key !== key);
  saveCart();
  updateCartUI();
  renderCartItems();
}

function saveCart() {
  localStorage.setItem('everest_cart', JSON.stringify(cart));
}

function updateCartUI() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  cartBadge.textContent = total;
  cartBadge.classList.toggle('hidden', total === 0);
}

function openCart() {
  renderCartItems();
  document.getElementById('cart-overlay').classList.remove('hidden');
}
function closeCart() {
  document.getElementById('cart-overlay').classList.add('hidden');
}

function renderCartItems() {
  if (cart.length === 0) {
    cartItems.innerHTML = `<div class="cart-empty">Your bag is empty.</div>`;
    cartTotal.textContent = 'EGP 0';
    return;
  }
  cartItems.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-img">${item.emoji}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-size">Size: ${item.size} · Qty: ${item.qty}</div>
        <div class="cart-item-price">EGP ${(item.price * item.qty).toLocaleString()}</div>
      </div>
      <button class="cart-item-remove" data-key="${item.key}">&times;</button>
    </div>`).join('');

  cartItems.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(btn.dataset.key));
  });

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  cartTotal.textContent = `EGP ${total.toLocaleString()}`;
}

// ── CHECKOUT ─────────────────────────────────────────────────
async function handleCheckout() {
  if (cart.length === 0) return;
  if (!currentUser) {
    closeCart();
    openAuth();
    alert('Please login to complete your order.');
    return;
  }

  // Ensure customer row exists (fixes "could not place order" bug)
  await db.from('customers').upsert({
    id: currentUser.id,
    email: currentUser.email,
    full_name: currentUser.user_metadata?.full_name || ''
  }, { onConflict: 'id' });

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const orderItems = cart.map(i => ({ product_id: i.id, name: i.name, size: i.size, qty: i.qty, price: i.price }));

  const { error } = await db.from('orders').insert({
    customer_id: currentUser.id,
    items: orderItems,
    total,
    status: 'pending'
  });

  if (error) {
    alert('Could not place order. Please try again.');
    console.error(error);
    return;
  }

  cart = [];
  saveCart();
  updateCartUI();
  closeCart();
  alert(`Order placed! Total: EGP ${total.toLocaleString()}\nThank you for shopping EveResT 🏔️`);
}

// ── ORDERS ───────────────────────────────────────────────────
async function openOrders() {
  document.getElementById('orders-overlay').classList.remove('hidden');
  const ordersList = document.getElementById('orders-list');
  ordersList.innerHTML = '<p style="color:var(--muted);font-size:0.9rem;">Loading...</p>';

  const { data, error } = await db
    .from('orders')
    .select('*')
    .eq('customer_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) {
    ordersList.innerHTML = '<p style="color:var(--muted);font-size:0.9rem;padding:1rem 0;">No orders yet.</p>';
    return;
  }

  ordersList.innerHTML = data.map(order => {
    const date = new Date(order.created_at).toLocaleDateString('en-EG', { year: 'numeric', month: 'short', day: 'numeric' });
    const items = (order.items || []).map(i => `${i.name} (${i.size}) ×${i.qty}`).join(', ');
    return `
      <div class="order-item">
        <div class="order-meta">
          <span class="order-id">#${order.id.toString().substring(0,8).toUpperCase()}</span>
          <span class="order-date">${date}</span>
        </div>
        <div class="order-products">${items}</div>
        <div class="order-total">EGP ${Number(order.total).toLocaleString()}</div>
        <span class="order-status">${order.status || 'pending'}</span>
      </div>`;
  }).join('');
}

// ── NAV & FILTERS ────────────────────────────────────────────
function setupNav() {
  // Filter buttons
  document.getElementById('filter-bar').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderProducts();
  });

  // Nav links
  document.querySelectorAll('.filter-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const filter = link.dataset.filter;
      activeFilter = filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      document.querySelector(`.filter-btn[data-filter="${filter}"]`)?.classList.add('active');
      renderProducts();
      document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Category cards
  document.querySelectorAll('.cat-card').forEach(card => {
    card.addEventListener('click', () => {
      const filter = card.dataset.filter;
      activeFilter = filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      document.querySelector(`.filter-btn[data-filter="${filter}"]`)?.classList.add('active');
      renderProducts();
      document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Notify btn
  document.getElementById('notify-btn').onclick = () => {
    if (!currentUser) { openAuth(); return; }
    alert('You\'re on the Night Summit notify list! 🏔️');
  };
}

// ── SEARCH ───────────────────────────────────────────────────
function setupSearch() {
  document.getElementById('search-icon').onclick = () => {
    searchBar.classList.toggle('hidden');
    if (!searchBar.classList.contains('hidden')) searchInput.focus();
  };
  document.getElementById('search-close-btn').onclick = () => {
    searchBar.classList.add('hidden');
    searchQuery = '';
    searchInput.value = '';
    renderProducts();
  };
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    renderProducts();
  });
}

// ── CATEGORIES ───────────────────────────────────────────────
function setupCategories() {
  // counts are updated after product load via updateCategoryCounts()
}
