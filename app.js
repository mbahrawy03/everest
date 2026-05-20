// ============================================================
//  EveResT — app.js  (v3)
//  Fixes: order bug, colors, multi-image, Instagram
// ============================================================

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ────────────────────────────────────────────────────
let allProducts = [];
let cart = JSON.parse(localStorage.getItem('everest_cart') || '[]');
let currentUser = null;
let currentProduct = null;
let selectedSize = null;
let selectedColor = null;
let activeFilter = 'all';
let searchQuery = '';

// ── DOM refs ─────────────────────────────────────────────────
const productGrid  = document.getElementById('product-grid');
const productCount = document.getElementById('product-count');
const cartBadge    = document.getElementById('cart-badge');
const cartItems    = document.getElementById('cart-items');
const cartTotal    = document.getElementById('cart-total');
const userBtn      = document.getElementById('user-btn');
const searchInput  = document.getElementById('search-input');
const searchBar    = document.getElementById('search-bar');

// ── Init ─────────────────────────────────────────────────────
(async () => {
  setupAuth();
  setupNav();
  setupCart();
  setupModals();
  setupSearch();
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

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('panel-login').classList.toggle('hidden', tab !== 'login');
      document.getElementById('panel-signup').classList.toggle('hidden', tab !== 'signup');
    });
  });

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

  document.getElementById('signup-btn').onclick = async () => {
    const name  = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const pass  = document.getElementById('signup-password').value;
    const err   = document.getElementById('signup-error');
    err.textContent = '';
    if (!name || !email || !pass) { err.textContent = 'Please fill in all fields.'; return; }
    if (pass.length < 6) { err.textContent = 'Password must be at least 6 characters.'; return; }
    const { data, error } = await db.auth.signUp({ email, password: pass, options: { data: { full_name: name } } });
    if (error) { err.textContent = error.message; return; }
    if (data.user) {
      await db.from('customers').upsert({ id: data.user.id, email, full_name: name }, { onConflict: 'id' });
    }
    closeAuth();
    alert('Account created! You can now login.');
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
  const choice = confirm(`Logged in as ${currentUser.email}\n\nOK → View Orders\nCancel → Logout`);
  if (choice) openOrders();
  else db.auth.signOut();
}

// ── PRODUCTS ─────────────────────────────────────────────────
async function loadProducts() {
  const { data, error } = await db.from('products').select('*').eq('active', true).order('created_at', { ascending: false });
  allProducts = (!error && data) ? data : getDemoProducts();
  renderProducts();
  updateCategoryCounts();
}

function getDemoProducts() {
  return [
    { id:1, name:'Summit Oversized Hoodie', category:'outerwear', price:2400, stock:15, sizes:['S','M','L','XL'], colors:['Black','White','Grey'], images:[], emoji:'🧥', tag:'new', description:'Premium heavyweight cotton blend. Dropped shoulders, kangaroo pocket.' },
    { id:2, name:'Altitude Utility Jacket',  category:'outerwear', price:4200, stock:8,  sizes:['S','M','L','XL'], colors:['Khaki','Black'],        images:[], emoji:'🫱', tag:'hot', description:'Multi-pocket technical jacket. Water-resistant shell.' },
    { id:3, name:'Peak Logo Heavy Tee',      category:'tops',      price:980,  stock:30, sizes:['XS','S','M','L','XL'], colors:['Black','White','Sand'], images:[], emoji:'👕', tag:'',   description:'280gsm heavyweight cotton. Oversized fit, chest logo print.' },
    { id:4, name:'Basecamp Cargo Pants',     category:'bottoms',   price:2100, stock:12, sizes:['S','M','L','XL'], colors:['Olive','Black'],        images:[], emoji:'👖', tag:'new', description:'Six-pocket cargo silhouette. Relaxed fit.' },
    { id:5, name:'EveResT Six-Panel Cap',    category:'accessories',price:650, stock:40, sizes:['One Size'],       colors:['Black','Beige'],        images:[], emoji:'🧢', tag:'new', description:'Structured six-panel cap. Embroidered logo.' },
    { id:6, name:'Urban Trail Backpack',     category:'accessories',price:3100,stock:7,  sizes:['One Size'],       colors:['Black'],                images:[], emoji:'🎒', tag:'',   description:'25L capacity. Laptop sleeve, padded straps.' },
  ];
}

function getMainImage(p) {
  if (p.images && p.images.length > 0) return `<img src="${p.images[0]}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;"/>`;
  if (p.image_url) return `<img src="${p.image_url}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;"/>`;
  return `<div class="product-emoji">${p.emoji || '👕'}</div>`;
}

function renderProducts() {
  let filtered = allProducts.filter(p => {
    const matchFilter = activeFilter === 'all' || p.category === activeFilter;
    const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchFilter && matchSearch;
  });

  productCount.textContent = `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    productGrid.innerHTML = `<div style="grid-column:1/-1;padding:4rem;text-align:center;color:var(--muted);">No products found.</div>`;
    return;
  }

  productGrid.innerHTML = filtered.map(p => {
    const tagHtml = p.tag ? `<span class="card-tag tag-${p.tag}">${p.tag}</span>` : '';
    const oldPrice = p.tag === 'sale' ? `<span class="old-price">EGP ${(p.price * 1.3).toFixed(0)}</span>` : '';
    const priceDisplay = p.tag === 'sale'
      ? `${oldPrice}<span class="sale-price">EGP ${p.price.toLocaleString()}</span>`
      : `EGP ${p.price.toLocaleString()}`;
    const colors = p.colors || [];
    const colorDots = colors.length > 0
      ? `<div class="color-dots">${colors.slice(0,4).map(c => `<span class="color-dot" style="background:${colorNameToHex(c)}" title="${c}"></span>`).join('')}${colors.length > 4 ? `<span style="font-size:0.7rem;color:var(--muted)">+${colors.length-4}</span>` : ''}</div>`
      : '';
    return `
      <div class="product-card" data-id="${p.id}">
        <div class="product-img">
          ${tagHtml}
          ${getMainImage(p)}
          <div class="card-overlay"><button class="quick-view">Quick View</button></div>
        </div>
        <div class="card-info">
          <div class="card-cat">${p.category}</div>
          <div class="card-name">${p.name}</div>
          ${colorDots}
          <div class="card-price">${priceDisplay}</div>
        </div>
      </div>`;
  }).join('');

  productGrid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => openProduct(card.dataset.id));
  });
}

function colorNameToHex(name) {
  const map = {
    // Basic Colors
    'black':'#1a1a1a',
    'white':'#f5f5f5',
    'off white':'#f0ede6',
    'off-white':'#f0ede6',
    'ivory':'#fffff0',

    // Greys
    'grey':'#888',
    'gray':'#888',
    'light grey':'#c8c8c8',
    'light gray':'#c8c8c8',
    'dark grey':'#444',
    'charcoal':'#36454f',
    'light grey boss':'#D0D0D0',
    'light grey balmain':'#E0E0E0',

    // Beige / Cream / Neutral
    'beige':'#c9b99a',
    'sand':'#d4c4a0',
    'taupe':'#b5a99a',
    'light beige':'#EDE6D8',
    'stone':'#EDE6D8',
    'cream':'#FAF6F0',
    'off-white cream':'#FAF6F0',
    'cream boss':'#F5EDE0',
    'off-white boss':'#F5EDE0',
    'off-white patterned':'#F5F4EF',

    // Browns
    'brown':'#78350f',
    'dark brown':'#3C2F2A',
    'chocolate':'#7b3f00',
    'dark brown chocolate':'#3C2F2A',
    'coffee':'#6f4e37',
    'tan':'#d2b48c',
    'camel':'#c19a6b',
    'mocha':'#967969',
    'walnut':'#773f1a',
    'light brown':'#a0785a',
    'khaki':'#8b7355',
    'khaki brownish olive':'#8A7D5F',
    'khaki taupe brown':'#8A7A5E',

    // Greens
    'olive':'#6b6b3a',
    'olive green':'#4A5F3E',
    'army':'#4a5240',
    'army green':'#4a5240',
    'military green':'#4a5240',
    'forest green':'#228b22',
    'green':'#16a34a',
    'dark green':'#1F3A2F',
    'dark green ck':'#1A3C2F',
    'dark green teal':'#1A3F35',
    'teal':'#008080',
    'teal green':'#006D5B',
    'cyan':'#00bcd4',
    'turquoise':'#40e0d0',
    'mint':'#98ff98',

    // Blues
    'navy':'#1a2744',
    'navy blue':'#1C2A44',
    'blue':'#2563eb',
    'sky blue':'#87ceeb',
    'baby blue':'#89cff0',
    'cobalt':'#0047ab',
    'royal blue':'#4169e1',

    // Reds / Burgundy / Maroon
    'red':'#B81E2E',
    'burgundy':'#5C1F2A',
    'maroon':'#5C1F2A',
    'wine':'#722f37',
    'deep purple':'#3F1E2E',

    // Orange / Rust
    'orange':'#ea580c',
    'burnt orange':'#cc5500',
    'rust':'#B85C3C',
    'orange-brown':'#B85C3C',
    'brick':'#cb4154',
    'terracotta':'#e2725b',
    'peach':'#ffcba4',
    'apricot':'#fbceb1',

    // Pinks
    'pink':'#ec4899',
    'light pink':'#F4C6C8',
    'blush':'#de9aa0',
    'rose':'#ff007f',
    'dusty pink':'#d4a0a0',

    // Purple
    'purple':'#9333ea',
    'lavender':'#e6e6fa',
    'lilac':'#c8a2c8',
    'plum':'#8e4585',

    // Yellow / Gold
    'yellow':'#ca8a04',
    'mustard':'#e1ad01',
    'golden':'#ffd700',
    'gold':'#ffd700',

    // Metallic
    'silver':'#c0c0c0',
  };

  const key = name.toLowerCase().trim();
  return map[key] || '#c9b99a';
}

function updateCategoryCounts() {
  ['tops','outerwear','bottoms','accessories'].forEach(cat => {
    const el = document.getElementById(`cnt-${cat}`);
    if (el) el.textContent = allProducts.filter(p => p.category === cat).length + ' items';
  });
}

// ── PRODUCT MODAL ────────────────────────────────────────────
let currentImageIndex = 0;

function openProduct(id) {
  currentProduct = allProducts.find(p => String(p.id) === String(id));
  if (!currentProduct) return;
  selectedSize = null;
  selectedColor = null;
  currentImageIndex = 0;

  document.getElementById('modal-cat').textContent   = currentProduct.category;
  document.getElementById('modal-name').textContent  = currentProduct.name;
  document.getElementById('modal-desc').textContent  = currentProduct.description || '';
  document.getElementById('modal-price').textContent = `EGP ${currentProduct.price.toLocaleString()}`;

  // Images gallery — use color_images if available, else fallback to images[]
  const colorImages = currentProduct.color_images?.filter(ci => ci.image) || [];
  const images = colorImages.length > 0
    ? colorImages.map(ci => ci.image)
    : (currentProduct.images?.length > 0 ? currentProduct.images : (currentProduct.image_url ? [currentProduct.image_url] : []));
  renderModalImages(images);

  // Stock
  // Stock shown dynamically when size+color selected
  document.getElementById('modal-stock').textContent = '';

  // Sizes
  const sizes = currentProduct.sizes || ['S','M','L','XL'];
  document.getElementById('size-grid').innerHTML = sizes.map(s =>
    `<button class="size-btn" data-size="${s}">${s}</button>`).join('');
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedSize = btn.dataset.size;
      updateStockDisplay();
    });
  });
  if (sizes.length === 1) {
    document.querySelector('.size-btn')?.classList.add('selected');
    selectedSize = sizes[0];
  }

  // Colors — clicking a color swaps the main image
  const colors = currentProduct.colors || [];
  const colorImagesData = currentProduct.color_images || [];
  const colorSection = document.getElementById('color-section');
  const colorGrid = document.getElementById('color-grid');
  if (colors.length > 0) {
    colorSection.classList.remove('hidden');
    colorGrid.innerHTML = colors.map(c => `
      <button class="color-swatch" data-color="${c}" style="background:${colorNameToHex(c)}" title="${c}"></button>`).join('');
    colorGrid.querySelectorAll('.color-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        colorGrid.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedColor = btn.dataset.color;
        // Swap main image to this color's photo
        const ci = colorImagesData.find(r => r.color === selectedColor);
        if (ci?.image) {
          const allImgs = colorImages.map(r => r.image).filter(Boolean);
          const idx = allImgs.indexOf(ci.image);
          currentImageIndex = idx >= 0 ? idx : 0;
          const mainImg = document.getElementById('gallery-main');
          if (mainImg) {
            mainImg.src = ci.image;
            document.querySelectorAll('.gallery-thumb').forEach((t,i) => t.classList.toggle('active', i === currentImageIndex));
            document.querySelectorAll('.gallery-dot').forEach((d,i) => d.classList.toggle('active', i === currentImageIndex));
          }
        }
      });
    });
    if (colors.length === 1) {
      colorGrid.querySelector('.color-swatch')?.classList.add('selected');
      selectedColor = colors[0];
    }
  } else {
    colorSection.classList.add('hidden');
  }

  document.getElementById('product-overlay').classList.remove('hidden');
}

function renderModalImages(images) {
  const imgBox = document.getElementById('modal-img');
  if (images.length === 0) {
    imgBox.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:6rem;opacity:0.5">${currentProduct.emoji || '👕'}</div>`;
    return;
  }
  imgBox.innerHTML = `
    <div class="img-gallery">
      <img src="${images[currentImageIndex]}" alt="product" class="gallery-main" id="gallery-main"/>
      ${images.length > 1 ? `
        <button class="gallery-prev" id="gallery-prev">&#8249;</button>
        <button class="gallery-next" id="gallery-next">&#8250;</button>
        <div class="gallery-dots">
          ${images.map((_,i) => `<span class="gallery-dot ${i===0?'active':''}" data-i="${i}"></span>`).join('')}
        </div>
        <div class="gallery-thumbs">
          ${images.map((img,i) => `<img src="${img}" class="gallery-thumb ${i===0?'active':''}" data-i="${i}" alt="thumb"/>`).join('')}
        </div>` : ''}
    </div>`;

  if (images.length > 1) {
    document.getElementById('gallery-prev').onclick = () => changeImage(images, currentImageIndex - 1);
    document.getElementById('gallery-next').onclick = () => changeImage(images, currentImageIndex + 1);
    imgBox.querySelectorAll('.gallery-thumb').forEach(t => t.addEventListener('click', () => changeImage(images, Number(t.dataset.i))));
    imgBox.querySelectorAll('.gallery-dot').forEach(d => d.addEventListener('click', () => changeImage(images, Number(d.dataset.i))));
  }
}

function changeImage(images, idx) {
  currentImageIndex = (idx + images.length) % images.length;
  document.getElementById('gallery-main').src = images[currentImageIndex];
  document.querySelectorAll('.gallery-dot').forEach((d,i) => d.classList.toggle('active', i === currentImageIndex));
  document.querySelectorAll('.gallery-thumb').forEach((t,i) => t.classList.toggle('active', i === currentImageIndex));
}

function setupModals() {
  document.getElementById('product-close').onclick  = () => document.getElementById('product-overlay').classList.add('hidden');
  document.getElementById('product-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('product-overlay')) document.getElementById('product-overlay').classList.add('hidden');
  });

  document.getElementById('modal-add-btn').onclick = () => {
    if (!selectedSize) { alert('Please select a size.'); return; }
    const colors = currentProduct.colors || [];
    if (colors.length > 0 && !selectedColor) { alert('Please select a color.'); return; }
    addToCart(currentProduct, selectedSize, selectedColor);
    document.getElementById('product-overlay').classList.add('hidden');
  };

  document.getElementById('orders-close').onclick  = () => document.getElementById('orders-overlay').classList.add('hidden');
  document.getElementById('orders-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('orders-overlay')) document.getElementById('orders-overlay').classList.add('hidden');
  });
}

// ── CART ─────────────────────────────────────────────────────
function setupCart() {
  document.getElementById('cart-btn').onclick   = openCart;
  document.getElementById('cart-close').onclick = closeCart;
  document.getElementById('cart-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('cart-overlay')) closeCart();
  });
  document.getElementById('checkout-btn').onclick = handleCheckout;
}

function addToCart(product, size, color) {
  const key = `${product.id}-${size}-${color||''}`;
  const existing = cart.find(i => i.key === key);
  if (existing) existing.qty += 1;
  else cart.push({ key, id: product.id, name: product.name, price: product.price, emoji: product.emoji || '👕', image: product.images?.[0] || product.image_url || null, size, color: color || null, qty: 1 });
  saveCart(); updateCartUI(); openCart();
}

function removeFromCart(key) {
  cart = cart.filter(i => i.key !== key);
  saveCart(); updateCartUI(); renderCartItems();
}

function saveCart() { localStorage.setItem('everest_cart', JSON.stringify(cart)); }

function updateCartUI() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  cartBadge.textContent = total;
  cartBadge.classList.toggle('hidden', total === 0);
}

function openCart()  { renderCartItems(); document.getElementById('cart-overlay').classList.remove('hidden'); }
function closeCart() { document.getElementById('cart-overlay').classList.add('hidden'); }

function renderCartItems() {
  if (cart.length === 0) {
    cartItems.innerHTML = `<div class="cart-empty">Your bag is empty.</div>`;
    cartTotal.textContent = 'EGP 0';
    return;
  }
  cartItems.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-img">
        ${item.image ? `<img src="${item.image}" alt="${item.name}" style="width:64px;height:80px;object-fit:cover;"/>` : item.emoji}
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-size">Size: ${item.size}${item.color ? ` · ${item.color}` : ''} · Qty: ${item.qty}</div>
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
  if (!currentUser) { closeCart(); openAuth(); return; }

  await db.from('customers').upsert({
    id: currentUser.id, email: currentUser.email,
    full_name: currentUser.user_metadata?.full_name || ''
  }, { onConflict: 'id' });

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const orderItems = cart.map(i => ({ product_id: i.id, name: i.name, size: i.size, color: i.color, qty: i.qty, price: i.price }));

  const { data: orderData, error } = await db.from('orders').insert({
    customer_id: currentUser.id, items: orderItems, total, status: 'awaiting_payment'
  }).select().single();

  if (error) { alert('Could not create order. Please try again.'); console.error(error); return; }

  localStorage.setItem('everest_checkout_order', JSON.stringify({
    orderId: orderData.id, total, items: orderItems,
    customer: { email: currentUser.email, name: currentUser.user_metadata?.full_name || '' }
  }));

  cart = []; saveCart(); updateCartUI(); closeCart();
  window.location.href = 'checkout.html';
}

// ── ORDERS ───────────────────────────────────────────────────
async function openOrders() {
  document.getElementById('orders-overlay').classList.remove('hidden');
  const ordersList = document.getElementById('orders-list');
  ordersList.innerHTML = '<p style="color:var(--muted);font-size:0.9rem;">Loading...</p>';
  const { data } = await db.from('orders').select('*').eq('customer_id', currentUser.id).order('created_at', { ascending: false });
  if (!data || data.length === 0) { ordersList.innerHTML = '<p style="color:var(--muted);font-size:0.9rem;padding:1rem 0;">No orders yet.</p>'; return; }
  ordersList.innerHTML = data.map(order => {
    const date  = new Date(order.created_at).toLocaleString('en-EG', {day:'numeric',month:'short',year:'numeric', hour:'2-digit',minute:'2-digit'})
    const items = (order.items || []).map(i => `${i.name} (${i.size}${i.color?', '+i.color:''}) ×${i.qty}`).join(', ');
    return `<div class="order-item">
      <div class="order-meta"><span class="order-id">#${order.id.toString().substring(0,8).toUpperCase()}</span><span class="order-date">${date}</span></div>
      <div class="order-products">${items}</div>
      <div class="order-total">EGP ${Number(order.total).toLocaleString()}</div>
      <span class="order-status">${order.status||'pending'}</span>
    </div>`;
  }).join('');
}

// ── NAV & FILTERS ────────────────────────────────────────────
function setupNav() {
  document.getElementById('filter-bar').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderProducts();
  });

  document.querySelectorAll('.filter-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      activeFilter = link.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      document.querySelector(`.filter-btn[data-filter="${activeFilter}"]`)?.classList.add('active');
      renderProducts();
      document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
    });
  });

  document.querySelectorAll('.cat-card').forEach(card => {
    card.addEventListener('click', () => {
      activeFilter = card.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      document.querySelector(`.filter-btn[data-filter="${activeFilter}"]`)?.classList.add('active');
      renderProducts();
      document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
    });
  });

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
