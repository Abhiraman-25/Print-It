(function () {
  const DOM = {
    byId: function (id) { return document.getElementById(id); },
    query: function (selector) { return document.querySelector(selector); },
    on: function (el, event, handler) { if (el) el.addEventListener(event, handler); },
  };

  const KEYS = {
    user: 'printit_user_v1',
    jobs: 'printit_jobs_v1',
    rewards: 'printit_rewards_v1',
    theme: 'printit_theme_v1',
    pricing: 'printit_pricing_overrides_v1',
  };

  const StorageService = {
    getUser: function () {
      try { return JSON.parse(localStorage.getItem(KEYS.user) || 'null'); } catch { return null; }
    },
    setUser: function (user) {
      localStorage.setItem(KEYS.user, JSON.stringify(user));
    },
    clearUser: function () { localStorage.removeItem(KEYS.user); },

    getJobs: function () {
      try { return JSON.parse(localStorage.getItem(KEYS.jobs) || '[]'); } catch { return []; }
    },
    setJobs: function (jobs) { localStorage.setItem(KEYS.jobs, JSON.stringify(jobs)); },
    addJob: function (job) {
      const jobs = this.getJobs();
      jobs.unshift(job);
      this.setJobs(jobs);
      return jobs;
    },
    clearAll: function () {
      localStorage.removeItem(KEYS.jobs);
      localStorage.removeItem(KEYS.rewards);
    },

    getRewards: function () {
      try { return JSON.parse(localStorage.getItem(KEYS.rewards) || '{"points":0,"redeemed":[]}'); } catch { return { points: 0, redeemed: [] }; }
    },
    setRewards: function (data) { localStorage.setItem(KEYS.rewards, JSON.stringify(data)); },
    addPoints: function (points) {
      const data = this.getRewards();
      data.points = (data.points || 0) + points;
      this.setRewards(data);
      return data.points;
    },
  };

  const AuthService = {
    get currentUser() { return StorageService.getUser(); },
    isSignedIn: function () { return !!this.currentUser; },
    signIn: function (email) {
      const user = { id: email.toLowerCase(), email, name: email.split('@')[0] };
      StorageService.setUser(user);
      return user;
    },
    signUp: function (name, email) {
      const user = { id: email.toLowerCase(), email, name: name || email.split('@')[0] };
      StorageService.setUser(user);
      return user;
    },
    signOut: function () { StorageService.clearUser(); },
  };

  function formatCurrency(value) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
  }

  function setYear() {
    const el = DOM.byId('year');
    if (el) el.textContent = String(new Date().getFullYear());
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    const desired = theme || localStorage.getItem(KEYS.theme) || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    root.setAttribute('data-theme', desired);
    localStorage.setItem(KEYS.theme, desired);
    const btn = DOM.byId('themeToggle');
    if (btn) btn.textContent = desired === 'dark' ? '🌙' : '🌞';
  }

  function initThemeToggle() {
    const btn = DOM.byId('themeToggle');
    if (!btn) return;
    applyTheme();
    DOM.on(btn, 'click', function () {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  function updateNavAuth() {
    const signedIn = AuthService.isSignedIn();
    const navLink = DOM.byId('navAuthLink');
    const footerLink = DOM.byId('footerAuthLink');
    const heroAuth = DOM.byId('heroAuthLink');
    if (navLink) navLink.textContent = signedIn ? 'Sign out' : 'Sign in';
    if (navLink) navLink.href = signedIn ? '#' : 'login.html';
    if (footerLink) footerLink.textContent = signedIn ? 'Sign out' : 'Sign in';
    if (footerLink) footerLink.href = signedIn ? '#' : 'login.html';
    if (heroAuth) heroAuth.textContent = signedIn ? 'My account' : 'Sign in';
    if (heroAuth) heroAuth.href = signedIn ? 'user.html' : 'login.html';
    if (signedIn) {
      [navLink, footerLink].forEach(function (link) {
        if (!link) return;
        link.onclick = function (e) {
          e.preventDefault();
          AuthService.signOut();
          window.location.reload();
        };
      });
    }
  }

  // Sync auth state changes across tabs
  window.addEventListener('storage', function (e) {
    if (e.key === KEYS.user) {
      updateNavAuth();
      const gate = DOM.byId('authGate');
      if (gate) gate.style.display = AuthService.isSignedIn() ? 'none' : '';
    }
  });

  function gateForAuth() {
    const gate = DOM.byId('authGate');
    if (!gate) return;
    if (!AuthService.isSignedIn()) {
      gate.style.display = '';
    } else {
      gate.style.display = 'none';
    }
  }

  // Pricing model
  const Pricing = {
    basePerPageBW: 1.0,
    basePerPageColor: 1.0,
    doubleSidedDiscount: 0.10,
    qualityMultiplier: { draft: 0.9, standard: 1.0, high: 1.2 },
    paperTypeMultiplier: { standard: 1.0, premium: 1.2, glossy: 1.35 },
    bindingPerCopy: { none: 0, staple: 0.25, spiral: 2.5, comb: 1.5 },
    finishingFlat: { none: 0, laminate: 250.0, hole_punch: 50.0 },
    deliveryFee: { pickup: 0, delivery: 49.0 },
    applyOverrides: function () {
      try {
        const o = JSON.parse(localStorage.getItem(KEYS.pricing) || '{}');
        if (o.basePerPageBW != null) this.basePerPageBW = Number(o.basePerPageBW);
        if (o.basePerPageColor != null) this.basePerPageColor = Number(o.basePerPageColor);
        if (o.deliveryPickup != null) this.deliveryFee.pickup = Number(o.deliveryPickup);
        if (o.deliveryDelivery != null) this.deliveryFee.delivery = Number(o.deliveryDelivery);
        if (o.bindingSpiral != null) this.bindingPerCopy.spiral = Number(o.bindingSpiral);
        if (o.finishingLaminate != null) this.finishingFlat.laminate = Number(o.finishingLaminate);
      } catch {}
    },
    estimate: function (opts) {
      this.applyOverrides();
      const pages = Math.max(1, Number(opts.pages) || 1);
      const copies = Math.max(1, Number(opts.copies) || 1);
      const perPage = opts.colorMode === 'bw' ? this.basePerPageBW : this.basePerPageColor;
      const sidedDiscount = opts.sidedness === 'two' ? (1 - this.doubleSidedDiscount) : 1;
      const quality = this.qualityMultiplier[opts.printQuality] || 1;
      const paper = this.paperTypeMultiplier[opts.paperType] || 1;
      const bindingPerCopy = this.bindingPerCopy[opts.binding] || 0;
      const finishing = this.finishingFlat[opts.finishing] || 0;
      const delivery = this.deliveryFee[opts.delivery] || 0;

      const pageCost = pages * perPage * sidedDiscount * quality * paper;
      const copiesCost = pageCost * copies;
      const bindingCost = bindingPerCopy * copies;
      const total = copiesCost + bindingCost + finishing + delivery;
      return Math.max(0, Number(total.toFixed(2)));
    },
    rewardPoints: function (opts) {
      const pages = Math.max(1, Number(opts.pages) || 1);
      const copies = Math.max(1, Number(opts.copies) || 1);
      // 0.25 points per page
      return pages * copies * 0.25;
    }
  };

  function initHome() { /* No-op for now */ }

  function initLogin() {
    const form = DOM.byId('authForm');
    const nameRow = DOM.byId('nameRow');
    const nameInput = DOM.byId('name');
    const email = DOM.byId('email');
    const password = DOM.byId('password');
    const msg = DOM.byId('authMessage');
    const roleSelect = DOM.byId('roleSelect');
    const toggleAuth = DOM.byId('toggleAuth');

    if (!form) return;

    let isSignup = false;
    function renderMode() { nameRow.style.display = isSignup ? '' : 'none'; }
    renderMode();
    if (toggleAuth) DOM.on(toggleAuth, 'click', function (e) {
      e.preventDefault();
      isSignup = !isSignup;
      renderMode();
      if (toggleAuth) toggleAuth.textContent = isSignup ? 'Already have an account? Sign in' : "Don't have an account? Create one";
    });

    DOM.on(form, 'submit', function (e) {
      e.preventDefault();
      const emailVal = (email.value || '').trim();
      const nameVal = (nameInput.value || '').trim();
      const pwd = (password.value || '').trim();
      const role = (roleSelect && roleSelect.value) || 'user';
      if (!emailVal || !pwd) {
        msg.textContent = 'Please enter email and password.';
        return;
      }
      if (isSignup) {
        AuthService.signUp(nameVal, emailVal);
        msg.textContent = 'Account created. Redirecting…';
      } else {
        AuthService.signIn(emailVal);
        msg.textContent = 'Signed in. Redirecting…';
      }
      // Persist role marker for admin gating demo
      try {
        const user = StorageService.getUser();
        if (user) { user.role = role; StorageService.setUser(user); }
      } catch {}
      setTimeout(function () { window.location.href = 'user.html'; }, 600);
    });
  }

  function readOptionsFromForm() {
    return {
      filename: (DOM.byId('fileInput') && DOM.byId('fileInput').files[0]) ? DOM.byId('fileInput').files[0].name : 'Document',
      pages: DOM.byId('numPages') ? Number(DOM.byId('numPages').value) : 1,
      copies: DOM.byId('numCopies') ? Number(DOM.byId('numCopies').value) : 1,
      colorMode: DOM.byId('colorMode') ? DOM.byId('colorMode').value : 'color',
      sidedness: DOM.byId('sidedness') ? DOM.byId('sidedness').value : 'two',
      binding: DOM.byId('binding') ? DOM.byId('binding').value : 'none',
      paperSize: DOM.byId('paperSize') ? DOM.byId('paperSize').value : 'A4',
      paperType: DOM.byId('paperType') ? DOM.byId('paperType').value : 'standard',
      orientation: DOM.byId('orientation') ? DOM.byId('orientation').value : 'portrait',
      printQuality: DOM.byId('printQuality') ? DOM.byId('printQuality').value : 'standard',
      finishing: DOM.byId('finishing') ? DOM.byId('finishing').value : 'none',
      delivery: 'pickup',
      address: '',
      paymentMethod: DOM.byId('paymentMethod') ? DOM.byId('paymentMethod').value : 'cash',
      notes: DOM.byId('additionalNotes') ? DOM.byId('additionalNotes').value : ''
    };
  }

  function applyPreset(preset) {
    const map = {
      report: { colorMode: 'bw', sidedness: 'two', binding: 'spiral', printQuality: 'standard', paperType: 'standard' },
      handout: { colorMode: 'bw', sidedness: 'one', binding: 'staple', printQuality: 'draft', paperType: 'standard' },
      photos: { colorMode: 'color', sidedness: 'one', binding: 'none', printQuality: 'high', paperType: 'glossy' }
    };
    const values = map[preset];
    if (!values) return;
    Object.keys(values).forEach(function (key) {
      const el = DOM.byId(key);
      if (el) el.value = values[key];
    });
    updateEstimate();
  }

  function updateEstimate() {
    const priceEl = DOM.byId('price');
    const pointsEl = DOM.byId('points');
    if (!priceEl || !pointsEl) return;
    const opts = readOptionsFromForm();
    const estimate = Pricing.estimate(opts);
    const points = Pricing.rewardPoints(opts);
    priceEl.textContent = formatCurrency(estimate);
    pointsEl.textContent = points.toFixed(2);
  }

  function initOptions() {
    gateForAuth();

    const form = DOM.byId('printForm');
    if (!form) return;

    ['numPages','numCopies','colorMode','sidedness','binding','paperSize','paperType','orientation','printQuality','finishing','delivery']
      .forEach(function (id) { DOM.on(DOM.byId(id), 'change', updateEstimate); DOM.on(DOM.byId(id), 'input', updateEstimate); });

    // Delivery removed

    document.querySelectorAll('[data-preset]').forEach(function (btn) {
      DOM.on(btn, 'click', function () { applyPreset(btn.getAttribute('data-preset')); });
    });

    updateEstimate();

    DOM.on(form, 'submit', function (e) {
      e.preventDefault();
      if (!AuthService.isSignedIn()) {
        alert('Please sign in to submit your print job.');
        window.location.href = 'login.html';
        return;
      }

      const opts = readOptionsFromForm();
      const price = Pricing.estimate(opts);
      const points = Pricing.rewardPoints(opts);
      const job = {
        id: 'job_' + Date.now(),
        createdAt: new Date().toISOString(),
        userId: AuthService.currentUser.id,
        fileName: opts.filename,
        pages: opts.pages,
        copies: opts.copies,
        colorMode: opts.colorMode,
        sidedness: opts.sidedness,
        binding: opts.binding,
        paperSize: opts.paperSize,
        paperType: opts.paperType,
        orientation: opts.orientation,
        printQuality: opts.printQuality,
        finishing: opts.finishing,
        delivery: opts.delivery,
        address: opts.address,
        paymentMethod: opts.paymentMethod,
        paymentStatus: 'Pending',
        notes: opts.notes,
        price: price,
        status: 'Submitted'
      };
      StorageService.addJob(job);
      StorageService.addPoints(points);
      window.location.href = 'user.html';
    });
  }

  function filterJobsForCurrentUser(allJobs) {
    const user = AuthService.currentUser;
    if (!user) return [];
    return allJobs.filter(function (j) { return j.userId === user.id; });
  }

  function formatDate(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }

  function initHistory() {
    gateForAuth();
    const tbody = DOM.byId('historyBody');
    const search = DOM.byId('historySearch');
    const clear = DOM.byId('clearHistory');
    if (!tbody) return;

    function render() {
      const jobs = filterJobsForCurrentUser(StorageService.getJobs());
      const q = (search && search.value || '').toLowerCase();
      const filtered = jobs.filter(function (j) {
        return [j.fileName, j.colorMode, j.binding, j.sidedness, j.status]
          .join(' ').toLowerCase().includes(q);
      });

      tbody.innerHTML = '';
      filtered.forEach(function (j) {
        const tr = document.createElement('tr');
        tr.innerHTML = [
          `<td>${formatDate(j.createdAt)}</td>`,
          `<td>${j.fileName}</td>`,
          `<td>${j.pages}</td>`,
          `<td>${j.copies}</td>`,
          `<td>${j.colorMode === 'bw' ? 'B/W' : 'Color'}</td>`,
          `<td>${j.sidedness === 'two' ? '2‑sided' : '1‑sided'}</td>`,
          `<td>${j.binding}</td>`,
          `<td>${j.paymentMethod || 'cash'}</td>`,
          `<td>${formatCurrency(j.price)}</td>`,
          `<td>${j.status}</td>`,
          `<td><button class="chip" data-repeat="${j.id}">Repeat</button></td>`
        ].join('');
        tbody.appendChild(tr);
      });

      document.querySelectorAll('[data-repeat]').forEach(function (btn) {
        DOM.on(btn, 'click', function () {
          const jobs = StorageService.getJobs();
          const job = jobs.find(function (jj) { return jj.id === btn.getAttribute('data-repeat'); });
          if (!job) return;
          const copy = Object.assign({}, job, { id: 'job_' + Date.now(), createdAt: new Date().toISOString(), status: 'Submitted' });
          StorageService.addJob(copy);
          StorageService.addPoints(Pricing.rewardPoints(copy));
          render();
        });
      });
    }

    if (search) DOM.on(search, 'input', render);
    if (clear) DOM.on(clear, 'click', function () {
      if (!confirm('Clear all your orders?')) return;
      const rest = StorageService.getJobs().filter(function (j) { return j.userId !== (AuthService.currentUser && AuthService.currentUser.id); });
      StorageService.setJobs(rest);
      render();
    });

    render();
  }

  function initRewards() {
    gateForAuth();
    const pointsEl = DOM.byId('pointsTotal');
    const tierNameEl = DOM.byId('tierName');
    const ordersCountEl = DOM.byId('ordersCount');
    const progressBar = DOM.byId('progressBar');
    const tierDetail = DOM.byId('tierDetail');
    const redeemBtn = DOM.byId('redeemBtn');
    const redeemMessage = DOM.byId('redeemMessage');

    const rewards = StorageService.getRewards();
    const orders = filterJobsForCurrentUser(StorageService.getJobs());
    const points = rewards.points || 0;
    const count = orders.length;

    function getTier(p) {
      if (p >= 1500) return { name: 'Platinum', nextAt: null };
      if (p >= 500) return { name: 'Gold', nextAt: 1500 };
      if (p >= 100) return { name: 'Silver', nextAt: 500 };
      return { name: 'Bronze', nextAt: 100 };
    }

    const tier = getTier(points);
    if (pointsEl) pointsEl.textContent = String(points);
    if (ordersCountEl) ordersCountEl.textContent = String(count);
    if (tierNameEl) tierNameEl.textContent = tier.name;

    if (tier.nextAt === null) {
      if (progressBar) progressBar.style.width = '100%';
      if (tierDetail) tierDetail.textContent = 'Top tier achieved. Enjoy your perks!';
    } else {
      const nextDelta = tier.nextAt - points;
      const base = tier.nextAt === 100 ? 100 : tier.nextAt - (tier.nextAt === 500 ? 100 : 500);
      const prevAt = tier.nextAt === 100 ? 0 : (tier.nextAt === 500 ? 100 : 500);
      const progressed = points - prevAt;
      const pct = Math.max(0, Math.min(100, Math.round((progressed / base) * 100)));
      if (progressBar) progressBar.style.width = pct + '%';
      if (tierDetail) tierDetail.textContent = `${progressed} / ${base} to ${tier.name === 'Bronze' ? 'Silver' : tier.name === 'Silver' ? 'Gold' : 'Platinum'}`;
    }

    if (redeemBtn) DOM.on(redeemBtn, 'click', function () {
      if (points < 50) {
        redeemMessage.textContent = 'You need at least 50 points to redeem this sample reward.';
        return;
      }
      const data = StorageService.getRewards();
      data.points -= 50;
      data.redeemed = data.redeemed || [];
      data.redeemed.push({ id: 'r_' + Date.now(), name: 'Sample ₹100 Off', at: new Date().toISOString() });
      StorageService.setRewards(data);
      redeemMessage.textContent = 'Redeemed! 50 points deducted.';
      setTimeout(function () { window.location.reload(); }, 400);
    });
  }

  function initAdmin() {
    // Gate: require signed-in and admin email (simple demo: email ending with '@admin')
    const gate = DOM.byId('authGateAdmin');
    if (!AuthService.isSignedIn() || !((AuthService.currentUser.role === 'admin') || (AuthService.currentUser.email || '').includes('@admin'))) {
      if (gate) gate.style.display = '';
      return;
    }

    const tableBody = DOM.byId('adminBody');
    const search = DOM.byId('adminSearch');
    const exportBtn = DOM.byId('exportCsv');
    const clearBtn = DOM.byId('clearAllData');
    const usersList = DOM.byId('usersList');
    const pricingForm = DOM.byId('pricingForm');
    const priceBW = DOM.byId('priceBW');
    const priceColor = DOM.byId('priceColor');
    const deliveryFeePickup = DOM.byId('deliveryFeePickup');
    const deliveryFeeDelivery = DOM.byId('deliveryFeeDelivery');
    const bindingSpiral = DOM.byId('bindingSpiral');
    const finishingLaminate = DOM.byId('finishingLaminate');
    const pricingMessage = DOM.byId('pricingMessage');
    const simulateOrdersBtn = DOM.byId('simulateOrders');

    function readAllJobs() { return StorageService.getJobs(); }
    function renderUsers() {
      if (!usersList) return;
      const jobs = readAllJobs();
      const byUser = {};
      jobs.forEach(function (j) { byUser[j.userId] = (byUser[j.userId] || 0) + 1; });
      usersList.innerHTML = '';
      Object.keys(byUser).forEach(function (uid) {
        const li = document.createElement('li');
        li.textContent = uid + ' — ' + byUser[uid] + ' orders';
        usersList.appendChild(li);
      });
    }

    function renderTable() {
      if (!tableBody) return;
      const q = (search && search.value || '').toLowerCase();
      const rows = readAllJobs().filter(function (j) {
        return [j.fileName, j.status, j.userId, j.paymentMethod].join(' ').toLowerCase().includes(q);
      });
      tableBody.innerHTML = '';
      rows.forEach(function (j) {
        const tr = document.createElement('tr');
        tr.innerHTML = [
          `<td>${formatDate(j.createdAt)}</td>`,
          `<td>${j.userId}</td>`,
          `<td>${j.fileName}</td>`,
          `<td>${j.pages}</td>`,
          `<td>${j.copies}</td>`,
          `<td>${j.colorMode === 'bw' ? 'B/W' : 'Color'}</td>`,
          `<td>${j.sidedness === 'two' ? '2‑sided' : '1‑sided'}</td>`,
          `<td>${j.binding}</td>`,
          `<td>${j.paymentMethod || 'cash'}</td>`,
          `<td>${formatCurrency(j.price)}</td>`,
          `<td>
             <select data-status="${j.id}" class="input">
               <option ${j.status==='Submitted'?'selected':''}>Submitted</option>
               <option ${j.status==='Processing'?'selected':''}>Processing</option>
               <option ${j.status==='Ready'?'selected':''}>Ready</option>
               <option ${j.status==='Completed'?'selected':''}>Completed</option>
               <option ${j.status==='Cancelled'?'selected':''}>Cancelled</option>
             </select>
           </td>`,
          `<td>
             <select data-pay="${j.id}" class="input">
               <option ${j.paymentStatus==='Pending'?'selected':''}>Pending</option>
               <option ${j.paymentStatus==='Paid'?'selected':''}>Paid</option>
               <option ${j.paymentStatus==='Refunded'?'selected':''}>Refunded</option>
             </select>
           </td>`,
          `<td>
             <button class="chip" data-del="${j.id}">Delete</button>
           </td>`
        ].join('');
        tableBody.appendChild(tr);
      });

      document.querySelectorAll('[data-status]').forEach(function (sel) {
        DOM.on(sel, 'change', function () {
          const id = sel.getAttribute('data-status');
          const jobs = StorageService.getJobs();
          const job = jobs.find(function (jj) { return jj.id === id; });
          if (job) { job.status = sel.value; StorageService.setJobs(jobs); }
        });
      });
      document.querySelectorAll('[data-pay]').forEach(function (sel) {
        DOM.on(sel, 'change', function () {
          const id = sel.getAttribute('data-pay');
          const jobs = StorageService.getJobs();
          const job = jobs.find(function (jj) { return jj.id === id; });
          if (job) { job.paymentStatus = sel.value; StorageService.setJobs(jobs); }
        });
      });
      document.querySelectorAll('[data-del]').forEach(function (btn) {
        DOM.on(btn, 'click', function () {
          if (!confirm('Delete this order?')) return;
          const id = btn.getAttribute('data-del');
          const jobs = StorageService.getJobs().filter(function (jj) { return jj.id !== id; });
          StorageService.setJobs(jobs);
          renderTable();
          renderUsers();
        });
      });
    }

    if (search) DOM.on(search, 'input', renderTable);
    if (exportBtn) DOM.on(exportBtn, 'click', function () {
      const rows = [['Date','User','File','Pages','Copies','Type','Sides','Binding','Payment','Price','Status','Payment Status']];
      StorageService.getJobs().forEach(function (j) {
        rows.push([j.createdAt, j.userId, j.fileName, j.pages, j.copies, j.colorMode, j.sidedness, j.binding, j.paymentMethod || 'cash', j.price, j.status, j.paymentStatus || 'Pending']);
      });
      const csv = rows.map(function (r) { return r.join(','); }).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'orders.csv'; a.click();
      URL.revokeObjectURL(url);
    });
    if (clearBtn) DOM.on(clearBtn, 'click', function () {
      if (!confirm('Clear ALL orders and rewards?')) return;
      StorageService.clearAll();
      renderTable();
      renderUsers();
    });

    if (pricingForm) DOM.on(pricingForm, 'submit', function (e) {
      e.preventDefault();
      const overrides = {
        basePerPageBW: priceBW && priceBW.value ? Number(priceBW.value) : undefined,
        basePerPageColor: priceColor && priceColor.value ? Number(priceColor.value) : undefined,
        deliveryPickup: deliveryFeePickup && deliveryFeePickup.value ? Number(deliveryFeePickup.value) : undefined,
        deliveryDelivery: deliveryFeeDelivery && deliveryFeeDelivery.value ? Number(deliveryFeeDelivery.value) : undefined,
        bindingSpiral: bindingSpiral && bindingSpiral.value ? Number(bindingSpiral.value) : undefined,
        finishingLaminate: finishingLaminate && finishingLaminate.value ? Number(finishingLaminate.value) : undefined,
      };
      localStorage.setItem(KEYS.pricing, JSON.stringify(overrides));
      if (pricingMessage) pricingMessage.textContent = 'Overrides saved.';
      setTimeout(function () { pricingMessage.textContent = ''; }, 1200);
    });

    if (simulateOrdersBtn) DOM.on(simulateOrdersBtn, 'click', function () {
      const now = Date.now();
      const samples = [
        { fileName: 'Report.pdf', pages: 24, copies: 1, colorMode: 'bw', sidedness: 'two', binding: 'spiral', paymentMethod: 'online', price: 120, status: 'Processing' },
        { fileName: 'Handout.docx', pages: 4, copies: 20, colorMode: 'bw', sidedness: 'one', binding: 'staple', paymentMethod: 'cash', price: 80, status: 'Submitted' },
        { fileName: 'Photos.zip', pages: 10, copies: 2, colorMode: 'color', sidedness: 'one', binding: 'none', paymentMethod: 'online', price: 300, status: 'Ready' },
      ];
      const currentUserId = (AuthService.currentUser && AuthService.currentUser.id) || 'admin@admin';
      samples.forEach(function (s, i) {
        StorageService.addJob({
          id: 'job_' + (now + i),
          createdAt: new Date(now - (i * 3600000)).toISOString(),
          userId: currentUserId,
          fileName: s.fileName,
          pages: s.pages,
          copies: s.copies,
          colorMode: s.colorMode,
          sidedness: s.sidedness,
          binding: s.binding,
          paperSize: 'A4', paperType: 'standard', orientation: 'portrait', printQuality: 'standard', finishing: 'none',
          delivery: 'pickup', address: '', paymentMethod: s.paymentMethod, paymentStatus: s.paymentMethod === 'online' ? 'Paid' : 'Pending',
          notes: '', price: s.price, status: s.status
        });
      });
      renderTable();
      renderUsers();
    });

    renderTable();
    renderUsers();
  }

  function initGlobal() {
    setYear();
    updateNavAuth();
    initThemeToggle();
  }

  document.addEventListener('DOMContentLoaded', function () {
    initGlobal();
    const page = document.body.getAttribute('data-page');
    if (page === 'home') initHome();
    if (page === 'login') initLogin();
    if (page === 'options') initOptions();
    if (page === 'user') { initHistory(); initUserProfile(); }
    if (page === 'rewards') initRewards();
    if (page === 'admin') initAdmin();
  });

  function initUserProfile() {
    const nameEl = DOM.byId('userName');
    const emailEl = DOM.byId('userEmail');
    const joinedEl = DOM.byId('userJoined');
    const user = AuthService.currentUser;
    if (!user) return;
    if (nameEl) nameEl.textContent = user.name || user.email;
    if (emailEl) emailEl.textContent = user.email;
    if (!user.createdAt) {
      user.createdAt = new Date().toISOString();
      StorageService.setUser(user);
    }
    if (joinedEl) joinedEl.textContent = new Date(user.createdAt).toLocaleDateString();
  }
})();

