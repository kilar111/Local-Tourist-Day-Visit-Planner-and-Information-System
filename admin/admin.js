(function () {
  'use strict';
  var app = document.getElementById('app'), toastBox = document.getElementById('toast');
  var csrf = '', admin = null, dashboard = {}, attractions = [], categories = [];
  var view = 'overview', page = 1, pageSize = 10, search = '', categoryFilter = '', sortBy = 'name', toastTimer;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function num(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
  function api(route, options) {
    options = options || {};
    var method = options.method || 'GET', headers = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;
    return fetch('../api/index.php?route=' + encodeURIComponent(route), {
      method: method, credentials: 'same-origin', headers: headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    }).then(function (response) {
      return response.json().catch(function () { return { error: 'The server returned an unreadable response.' }; }).then(function (data) {
        if (!response.ok) { var e = new Error(data.error || 'The request could not be completed.'); e.status = response.status; throw e; }
        return data;
      });
    }).catch(function (error) {
      if (error.status) throw error;
      var e = new Error('The server could not be reached. Check the PHP and database services.'); e.status = 0; throw e;
    });
  }
  function toast(message, error) {
    toastBox.textContent = message;
    toastBox.classList.toggle('error', !!error);
    toastBox.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastBox.classList.remove('visible'); }, 3200);
  }
  function date(value) {
    if (!value) return 'Not recorded';
    var d = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? String(value).slice(0, 16) : d.toLocaleDateString(undefined, { day:'2-digit', month:'short', year:'numeric' });
  }
  function initials(value) {
    return String(value || 'Admin').trim().split(/[ ._-]+/).filter(Boolean).slice(0,2).map(function (x) { return x[0].toUpperCase(); }).join('') || 'AD';
  }
  function navButton(id, label, number) {
    var active = view === id || (view === 'attraction-form' && id === 'attractions') || (view === 'category-form' && id === 'categories');
    return '<button class="nav-item" type="button" data-view="' + id + '" aria-current="' + (active ? 'page' : 'false') + '"><span class="nav-symbol">' + number + '</span><span>' + label + '</span></button>';
  }
  function shell() {
    app.innerHTML = '<div class="admin-shell"><aside class="sidebar">' +
      '<a class="brand-lockup" href="./" style="color:inherit;text-decoration:none"><span class="brand-monogram">FN</span><span><span class="brand-name">Fieldnotes</span><span class="brand-subtitle">Local guide / office</span></span></a>' +
      '<div class="nav-caption">Guide management</div><nav class="admin-nav" aria-label="Administration">' +
      navButton('overview','Overview','01') + navButton('attractions','Attractions','02') + navButton('categories','Categories','03') +
      '</nav><button class="nav-item nav-add" type="button" data-action="add-attraction"><span class="nav-symbol">+</span><span>Add attraction</span></button>' +
      '<div class="sidebar-spacer"></div><div class="sidebar-note"><strong>Editorial note</strong>Leave hours, fees and map coordinates blank until they have been checked against a reliable source.</div>' +
      '<a class="side-link" href="../" target="_blank" rel="noopener noreferrer"><span>View public guide</span><span aria-hidden="true">&#8599;</span></a>' +
      '<div class="side-account"><span class="avatar">' + esc(initials(admin && admin.username)) + '</span><span><span class="account-name">' + esc(admin && admin.username || 'Administrator') + '</span><span class="account-role">Administrator</span></span></div></aside>' +
      '<button class="sidebar-scrim" type="button" data-action="close-sidebar" aria-label="Close navigation"></button>' +
      '<main class="workspace"><header class="workspace-head"><div class="breadcrumbs"><button class="menu-toggle" type="button" data-action="toggle-sidebar" aria-label="Open navigation" aria-expanded="false">Menu</button><span>Fieldnotes</span><span>/</span><strong id="breadcrumb"></strong></div>' +
      '<div class="head-actions"><a class="public-link" href="../" target="_blank" rel="noopener noreferrer">View public guide &nbsp;&#8599;</a><div class="head-account"><span class="avatar">' + esc(initials(admin && admin.username)) + '</span><span class="head-account-name">' + esc(admin && admin.username || 'Administrator') + '</span></div><button class="button button-quiet button-small" type="button" data-action="logout">Sign out</button></div></header>' +
      '<div class="workspace-content"><div class="page-heading"><div><div class="page-eyebrow">FIELDNOTES / ADMINISTRATION</div><h1 id="page-title"></h1><p id="page-subtitle"></p></div><div id="heading-action"></div></div><div id="view-content"></div></div></main></div>';
  }
  function setPage(title, subtitle, action, content) {
    document.getElementById('page-title').textContent = title;
    document.getElementById('page-subtitle').textContent = subtitle;
    document.getElementById('breadcrumb').textContent = title;
    document.getElementById('heading-action').innerHTML = action || '';
    document.getElementById('view-content').innerHTML = content;
    document.querySelectorAll('[data-view]').forEach(function (b) {
      var active = b.dataset.view === view || (view === 'attraction-form' && b.dataset.view === 'attractions') || (view === 'category-form' && b.dataset.view === 'categories');
      b.setAttribute('aria-current', active ? 'page' : 'false');
    });
    document.body.classList.remove('menu-open');
  }
  function stat(index, label, value, note) {
    return '<article class="stat-card"><div class="stat-label">' + esc(label) + '<span class="stat-index">' + index + '</span></div><strong class="stat-number">' + esc(value) + '</strong><div class="stat-foot">' + esc(note) + '</div></article>';
  }
  function coverage(label, value, total) {
    var percent = total ? Math.round(num(value) / total * 100) : 0;
    return '<div><div class="coverage-head"><span>' + label + '</span><span class="coverage-value">' + num(value) + ' / ' + total + '</span></div><div class="coverage-track"><span style="width:' + percent + '%"></span></div></div>';
  }
  function showOverview() {
    view = 'overview';
    var complete = dashboard.data_completeness || {}, total = num(dashboard.attraction_count);
    var cats = dashboard.category_counts || [], max = Math.max(1, ...cats.map(function (c) { return num(c.attraction_count); }));
    var categoryRows = cats.length ? cats.map(function (c) {
      return '<div class="category-row"><span class="category-row-name">' + esc(c.name) + '</span><span class="category-bar"><span style="width:' + Math.round(num(c.attraction_count) / max * 100) + '%"></span></span><span class="category-row-count">' + num(c.attraction_count) + '</span></div>';
    }).join('') : '<div class="empty-state">No categories have been recorded.</div>';
    var recent = (dashboard.recently_added || []).map(function (p) {
      return '<tr><td><span class="table-primary">' + esc(p.name) + '</span><span class="table-secondary">Record #' + num(p.id) + '</span></td><td class="table-muted">' + esc(date(p.created_at)) + '</td></tr>';
    }).join('');
    if (!recent) recent = '<tr><td colspan="2"><div class="empty-state"><strong>No attraction records</strong><p>Add the first place to begin the guide.</p><button class="button button-primary button-small" data-action="add-attraction">Add a place</button></div></td></tr>';
    var edited = (dashboard.recently_updated || []).map(function (p) {
      return '<li><span class="status-dot"></span><span><strong>' + esc(p.name) + '</strong><small>Updated ' + esc(date(p.updated_at)) + '</small></span></li>';
    }).join('') || '<li class="empty-activity">No edits recorded yet. New entries are listed separately.</li>';
    setPage('Overview','A clear view of the guide records and the details visitors can rely on.','',
      '<section class="stats-grid">' +
      stat('01','Attractions in guide',total,'Records available to visitors') +
      stat('02','Guide categories',num(dashboard.category_count),'Predefined and custom categories') +
      stat('03','Visitor details complete',num(complete.complete_records) + ' / ' + total,'Hours, fee, facilities and duration recorded') +
      stat('04','Verified map points',num(complete.coordinates) + ' / ' + total,'Both latitude and longitude recorded') +
      '</section><section class="overview-grid">' +
      '<article class="panel"><header class="panel-head"><div><h2 class="panel-title">Information coverage</h2><p class="panel-kicker">Practical details currently recorded for visitors</p></div><span class="badge">DATABASE</span></header><div class="panel-body"><div class="coverage-list">' +
      coverage('Opening hours',complete.opening_hours,total) + coverage('Entrance fee',complete.entrance_fee,total) + coverage('Facilities',complete.facilities,total) + coverage('Visit duration',complete.visit_minutes,total) + coverage('Verified coordinates',complete.coordinates,total) +
      '</div></div><div class="panel-foot"><span class="note-mark">NOTE</span><span>Blank fields remain unknown. Confirm information with each attraction before publishing it as verified.</span></div></article>' +
      '<article class="panel"><header class="panel-head"><div><h2 class="panel-title">Attractions by category</h2><p class="panel-kicker">Current relationships in the database</p></div><button class="button button-quiet button-small" data-view="categories">Manage categories</button></header><div class="panel-body"><div class="category-list">' + categoryRows + '</div></div><div class="panel-foot"><span class="note-mark">KEY</span><span>Counts may overlap because a place can have more than one category.</span></div></article></section>' +
      '<section class="overview-grid"><article class="panel"><header class="panel-head"><div><h2 class="panel-title">Recently added</h2><p class="panel-kicker">Newest attraction records, from database timestamps</p></div><button class="button button-quiet button-small" data-view="attractions">View all</button></header><div class="table-wrap"><table class="data-table"><thead><tr><th>Attraction</th><th>Added</th></tr></thead><tbody>' + recent + '</tbody></table></div></article>' +
      '<article class="panel"><header class="panel-head"><div><h2 class="panel-title">Recently edited</h2><p class="panel-kicker">Records changed after initial creation</p></div></header><div class="panel-body"><ul class="activity-list">' + edited + '</ul></div></article></section>');
  }
  function filteredPlaces() {
    var q = search.trim().toLowerCase();
    var list = attractions.filter(function (p) {
      var cats = Array.isArray(p.categories) ? p.categories : [];
      return (!q || [p.name,p.short_description,p.description,cats.join(' ')].join(' ').toLowerCase().includes(q)) && (!categoryFilter || cats.includes(categoryFilter));
    });
    list.sort(function (a,b) {
      if (sortBy === 'distance') return (a.distance_km == null ? 99999 : num(a.distance_km)) - (b.distance_km == null ? 99999 : num(b.distance_km)) || String(a.name).localeCompare(String(b.name));
      if (sortBy === 'updated') return String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || String(a.name).localeCompare(String(b.name));
      return String(a.name).localeCompare(String(b.name));
    });
    return list;
  }
  function attractionRows() {
    var node = document.getElementById('attraction-results'), pager = document.getElementById('attraction-pagination');
    if (!node || !pager) return;
    var list = filteredPlaces(), pages = Math.max(1, Math.ceil(list.length / pageSize));
    page = Math.min(page, pages);
    var start = (page - 1) * pageSize, shown = list.slice(start, start + pageSize);
    node.innerHTML = shown.length ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Attraction</th><th>Categories</th><th>Distance</th><th>Visitor detail</th><th>Updated</th><th class="actions-cell">Actions</th></tr></thead><tbody>' + shown.map(function (p) {
      var cats = (p.categories || []).map(function (c) { return '<span class="badge">' + esc(c) + '</span>'; }).join(' ');
      var detail = p.opening_hours && p.entrance_fee !== null && p.facilities && p.visit_minutes ? 'Details recorded' : 'Some details unknown';
      var distance = p.distance_km == null ? 'Not recorded' : num(p.distance_km).toFixed(1) + ' km';
      return '<tr><td class="table-name-cell"><span class="table-primary">' + esc(p.name) + '</span><span class="table-secondary">' + esc(p.short_description || 'No short description') + '</span></td><td>' + (cats || 'Uncategorised') + '</td><td class="table-muted">' + esc(distance) + '</td><td class="table-muted"><span class="status-dot"></span>' + detail + '</td><td class="table-muted">' + esc(date(p.updated_at)) + '</td><td class="actions-cell"><div class="row-actions"><button class="button button-small" data-action="edit-attraction" data-id="' + num(p.id) + '">Edit</button><button class="button button-small button-danger" data-action="delete-attraction" data-id="' + num(p.id) + '">Delete</button></div></td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="empty-state"><strong>No matching attractions</strong><p>Try another search or category, or add a new record.</p></div>';
    pager.innerHTML = '<div class="pagination"><span>Showing ' + (list.length ? start + 1 : 0) + '-' + Math.min(start + pageSize,list.length) + ' of ' + list.length + '</span><div class="pagination-actions"><button class="button button-small" data-action="page-prev"' + (page <= 1 ? ' disabled' : '') + '>Previous</button><span class="button button-small">Page ' + page + ' of ' + pages + '</span><button class="button button-small" data-action="page-next"' + (page >= pages ? ' disabled' : '') + '>Next</button></div></div>';
  }
  function showAttractions() {
    view = 'attractions';
    var opts = categories.map(function (c) { return '<option' + (categoryFilter === c.name ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
    setPage('Attractions','Review, search and maintain the places in the Fieldnotes guide.','<button class="button button-primary" data-action="add-attraction">+ Add attraction</button>',
      '<section class="panel"><div class="panel-head"><div><h2 class="panel-title">Attraction records</h2><p class="panel-kicker">' + attractions.length + ' record' + (attractions.length === 1 ? '' : 's') + ' in the guide</p></div><span class="badge">LIVE DATABASE</span></div><div class="panel-body"><div class="filter-bar">' +
      '<label class="input-wrap"><span class="search-mark">Find</span><input class="control" id="attraction-search" type="search" placeholder="Name, description or category" value="' + esc(search) + '" aria-label="Search attraction records"></label>' +
      '<label class="filter-select"><span class="visually-hidden">Filter by category</span><select class="control" id="attraction-category"><option value="">All categories</option>' + opts + '</select></label>' +
      '<label class="filter-select"><span class="visually-hidden">Sort attraction records</span><select class="control" id="attraction-sort"><option value="name"' + (sortBy === 'name' ? ' selected' : '') + '>Name A to Z</option><option value="distance"' + (sortBy === 'distance' ? ' selected' : '') + '>Nearest first</option><option value="updated"' + (sortBy === 'updated' ? ' selected' : '') + '>Recently changed</option></select></label>' +
      '</div><div id="attraction-results"></div><div id="attraction-pagination"></div></div></section>');
    attractionRows();
  }
  function field(label, name, value, type, required, help, max) {
    var id = 'field-' + name;
    var req = required ? ' <span class="required-mark">*</span>' : '';
    var helper = help ? '<span class="field-help">' + esc(help) + '</span>' : '';
    if (type === 'textarea') return '<div class="form-field full"><label for="' + id + '">' + esc(label) + req + '</label><textarea class="field-control" id="' + id + '" name="' + name + '" maxlength="' + (max || 500) + '"' + (required ? ' required' : '') + '>' + esc(value) + '</textarea>' + helper + '</div>';
    return '<div class="form-field"><label for="' + id + '">' + esc(label) + req + '</label><input class="field-control" id="' + id + '" name="' + name + '" type="' + type + '" value="' + esc(value) + '" maxlength="' + (max || 500) + '"' + (required ? ' required' : '') + '>' + helper + '</div>';
  }
  async function editAttraction(id) {
    try {
      var place = id ? (await api('admin/attractions/' + num(id))).item : {};
      place = place || {};
      view = 'attraction-form'; shell();
      var chosen = (place.category_ids || []).map(Number);
      var facilityText = Array.isArray(place.facility_items) && place.facility_items.length ? place.facility_items.join('\n') : (place.facilities || '');
      var checks = categories.map(function (c) { return '<label class="check-option"><input type="checkbox" name="category_ids" value="' + num(c.id) + '"' + (chosen.includes(num(c.id)) ? ' checked' : '') + '><span>' + esc(c.name) + '</span></label>'; }).join('');
      setPage(id ? 'Edit attraction' : 'Add attraction','Enter verified information and leave anything uncertain blank.','',
        '<section class="form-card"><div class="form-card-head"><h2>' + (id ? 'Edit attraction' : 'Add an attraction') + '</h2><p>Blank optional values remain unknown in the public guide.</p></div><form class="form-body" id="attraction-form" data-id="' + (id ? num(id) : '') + '">' +
        '<div class="form-section-title">Guide entry</div><div class="form-grid">' +
        field('Attraction name','name',place.name,'text',true,'Use the name visitors will recognize.',180) +
        '<div class="form-field"><label for="distance-km">Approx. distance from starting area (km)</label><input class="field-control" id="distance-km" name="distance_km" type="number" min="0" max="25" step="0.1" value="' + esc(place.distance_km) + '"><span class="field-help">This is not a multi-stop route distance.</span></div>' +
        '<div class="form-field full"><span class="form-label">Categories <span class="required-mark">*</span></span><div class="category-checks" role="group" aria-label="Attraction categories">' + checks + '</div><span class="field-help">Select at least one category.</span></div>' +
        field('Short description','short_description',place.short_description,'textarea',true,'Shown in the attraction list.',320) +
        field('Detailed description','description',place.description,'textarea',false,'Keep descriptions factual and relevant.',10000) +
        '</div><div class="form-section-title" style="margin-top:24px">Visitor information</div><div class="form-grid">' +
        field('Opening hours','opening_hours',place.opening_hours,'text',false,'Leave blank if not checked.',180) +
        '<div class="form-field"><label for="fee">Entrance fee per person (LKR)</label><input class="field-control" id="fee" name="entrance_fee" type="number" min="0" max="1000000" step="0.01" value="' + esc(place.entrance_fee) + '" placeholder="Unknown"><span class="field-help">Blank means unknown. Use 0 only when free entry is confirmed.</span></div>' +
        field('Facilities (one per line)','facilities',facilityText,'textarea',false,'Retained for the public guide and related to Facilities records.',500) +
        '<div class="form-field"><label for="visit-minutes">Recommended visit duration (minutes)</label><input class="field-control" id="visit-minutes" name="visit_minutes" type="number" min="1" max="1440" step="1" value="' + esc(place.visit_minutes) + '" placeholder="Unknown"></div>' +
        field('Travel tips','travel_tips',place.travel_tips,'textarea',false,'Practical notes for visitors.',1200) +
        field('Image URL','image_url',place.image_url,'url',false,'Optional; HTTPS URLs only.',2048) +
        '</div><div class="form-section-title" style="margin-top:24px">Map reference</div><div class="form-grid">' +
        '<div class="form-field"><label for="latitude">Verified latitude</label><input class="field-control" id="latitude" name="latitude" type="number" min="-90" max="90" step="any" value="' + esc(place.latitude) + '" placeholder="Leave blank until verified"></div>' +
        '<div class="form-field"><label for="longitude">Verified longitude</label><input class="field-control" id="longitude" name="longitude" type="number" min="-180" max="180" step="any" value="' + esc(place.longitude) + '" placeholder="Leave blank until verified"></div></div>' +
        '<div class="form-note">Do not publish estimated fees, hours, facilities or coordinates as facts. Enter both coordinates only after verification.</div>' +
        '<div id="form-message" class="notice-line" role="status"></div><div class="form-actions"><button class="button button-primary" id="save-attraction" type="submit">' + (id ? 'Save changes' : 'Add attraction') + '</button><button class="button" type="button" data-action="cancel-attraction">Cancel</button>' +
        (id ? '<button class="button button-danger" type="button" data-action="delete-attraction" data-id="' + num(id) + '">Delete record</button>' : '') + '</div></form></section>');
    } catch (error) { toast(error.message, true); }
  }
  function formMessage(message, isError) {
    var node = document.getElementById('form-message');
    if (!node) return;
    node.textContent = message || '';
    node.classList.toggle('error', !!isError);
  }
  function optionalNumber(form, name) {
    var value = form.elements[name].value;
    return value === '' ? null : Number(value);
  }
  async function saveAttraction(form) {
    var id = form.dataset.id || '', data = new FormData(form), button = document.getElementById('save-attraction');
    var chosen = data.getAll('category_ids').map(Number).filter(Boolean);
    if (!chosen.length) { formMessage('Choose at least one category before saving.', true); return; }
    var lat = form.elements.latitude.value, lon = form.elements.longitude.value;
    if ((lat && !lon) || (!lat && lon)) { formMessage('Enter both coordinates, or leave both blank.', true); return; }
    var body = {
      name: String(data.get('name') || '').trim(), short_description: String(data.get('short_description') || '').trim(),
      description: String(data.get('description') || '').trim() || null, category_ids: chosen,
      distance_km: optionalNumber(form,'distance_km'), opening_hours: String(data.get('opening_hours') || '').trim() || null,
      entrance_fee: optionalNumber(form,'entrance_fee'), facilities: String(data.get('facilities') || '').trim() || null,
      travel_tips: String(data.get('travel_tips') || '').trim() || null, visit_minutes: optionalNumber(form,'visit_minutes'),
      image_url: String(data.get('image_url') || '').trim() || null, latitude: optionalNumber(form,'latitude'), longitude: optionalNumber(form,'longitude')
    };
    button.disabled = true; button.textContent = 'Saving record...';
    try {
      await api(id ? 'admin/attractions/' + num(id) : 'admin/attractions', { method: id ? 'PUT' : 'POST', body: body });
      await refresh();
      page = 1; search = ''; categoryFilter = '';
      showAttractions(); toast(id ? 'Attraction changes saved.' : 'Attraction added to the guide.');
    } catch (error) {
      formMessage(error.message, true); button.disabled = false; button.textContent = id ? 'Save changes' : 'Add attraction';
    }
  }
  async function deleteAttraction(id) {
    var p = attractions.find(function (x) { return num(x.id) === num(id); });
    if (!window.confirm('Delete "' + (p ? p.name : 'this attraction') + '"? This action cannot be undone.')) return;
    try {
      await api('admin/attractions/' + num(id), { method:'DELETE', body:{} });
      await refresh(); showAttractions(); toast('Attraction deleted.');
    } catch (error) { toast(error.message, true); }
  }
  function showCategories() {
    view = 'categories';
    var rows = categories.map(function (c) {
      var fixed = num(c.is_system) === 1, count = num(c.attraction_count);
      return '<tr><td><span class="table-primary">' + esc(c.name) + '</span><span class="table-secondary">' + esc(c.slug) + '</span></td><td><span class="badge ' + (fixed ? 'badge-protected' : 'badge-custom') + '">' + (fixed ? 'Project category / protected' : 'Custom category') + '</span></td><td>' + count + ' attraction' + (count === 1 ? '' : 's') + '</td><td class="actions-cell"><div class="row-actions">' +
      (fixed ? '<span class="protected-note">Fixed by project rules</span>' : '<button class="button button-small" data-action="edit-category" data-id="' + num(c.id) + '">Edit</button><button class="button button-small button-danger" data-action="delete-category" data-id="' + num(c.id) + '"' + (count ? ' disabled title="Reassign attractions before deleting this category."' : '') + '>Delete</button>') +
      '</div></td></tr>';
    }).join('');
    setPage('Categories','Keep the guide taxonomy consistent as its collection grows.','<button class="button button-primary" data-action="add-category">+ Add category</button>',
      '<section class="panel"><div class="panel-head"><div><h2 class="panel-title">Guide categories</h2><p class="panel-kicker">Project categories stay protected; unused custom categories can be removed.</p></div><span class="badge">' + categories.length + ' TOTAL</span></div><div class="panel-body">' +
      '<label class="input-wrap" style="display:block;max-width:420px;margin-bottom:14px"><span class="visually-hidden">Search categories</span><span class="search-mark">Find</span><input class="control" id="category-search" type="search" placeholder="Find a category"></label>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Category</th><th>Type</th><th>Attraction count</th><th class="actions-cell">Actions</th></tr></thead><tbody id="category-rows">' + rows + '</tbody></table></div><p class="field-help">A category with linked attractions cannot be deleted. Reassign those records first.</p></div></section>');
    document.getElementById('category-search').addEventListener('input', filterCategories);
  }
  function filterCategories() {
    var input = document.getElementById('category-search'), rows = document.getElementById('category-rows');
    if (!input || !rows) return;
    var q = input.value.trim().toLowerCase();
    var list = categories.filter(function (c) { return !q || String(c.name).toLowerCase().includes(q); });
    rows.innerHTML = list.length ? list.map(function (c) {
      var fixed = num(c.is_system) === 1, count = num(c.attraction_count);
      return '<tr><td><span class="table-primary">' + esc(c.name) + '</span><span class="table-secondary">' + esc(c.slug) + '</span></td><td><span class="badge ' + (fixed ? 'badge-protected' : 'badge-custom') + '">' + (fixed ? 'Project category / protected' : 'Custom category') + '</span></td><td>' + count + ' attraction' + (count === 1 ? '' : 's') + '</td><td class="actions-cell"><div class="row-actions">' +
      (fixed ? '<span class="protected-note">Fixed by project rules</span>' : '<button class="button button-small" data-action="edit-category" data-id="' + num(c.id) + '">Edit</button><button class="button button-small button-danger" data-action="delete-category" data-id="' + num(c.id) + '"' + (count ? ' disabled title="Reassign attractions before deleting this category."' : '') + '>Delete</button>') + '</div></td></tr>';
    }).join('') : '<tr><td colspan="4" class="table-muted">No categories match this search.</td></tr>';
  }
  function categoryForm(category) {
    category = category || {}; view = 'category-form'; shell();
    setPage(category.id ? 'Edit category' : 'Add category','Create or revise a custom guide category.','',
      '<section class="form-card"><div class="form-card-head"><h2>' + (category.id ? 'Edit custom category' : 'Add a custom category') + '</h2><p>The four project categories stay fixed; custom categories update the public guide after saving.</p></div><form class="form-body" id="category-form" data-id="' + (category.id ? num(category.id) : '') + '">' +
      '<div class="form-grid"><div class="form-field"><label for="category-name">Category name <span class="required-mark">*</span></label><input class="field-control" id="category-name" name="name" maxlength="60" required value="' + esc(category.name) + '"><span class="field-help">Use a short name with letters or numbers.</span></div></div>' +
      '<div id="form-message" class="notice-line" role="status"></div><div class="form-actions"><button class="button button-primary" id="save-category" type="submit">' + (category.id ? 'Save category' : 'Add category') + '</button><button class="button" type="button" data-action="cancel-category">Cancel</button></div></form></section>');
  }
  async function editCategory(id) {
    if (!id) return categoryForm({});
    var c = categories.find(function (x) { return num(x.id) === num(id); });
    if (!c || num(c.is_system) === 1) { toast('The four project categories are protected.', true); return; }
    categoryForm(c);
  }
  async function saveCategory(form) {
    var id = form.dataset.id || '', data = new FormData(form), button = document.getElementById('save-category');
    button.disabled = true; button.textContent = 'Saving category...';
    try {
      await api(id ? 'admin/categories/' + num(id) : 'admin/categories', { method:id ? 'PUT' : 'POST', body:{ name:String(data.get('name') || '').trim() } });
      await refresh(); showCategories(); toast(id ? 'Category changes saved.' : 'Custom category added.');
    } catch (error) {
      formMessage(error.message, true); button.disabled = false; button.textContent = id ? 'Save category' : 'Add category';
    }
  }
  async function deleteCategory(id) {
    var c = categories.find(function (x) { return num(x.id) === num(id); });
    if (!c || num(c.is_system) === 1) { toast('The four project categories are protected.', true); return; }
    if (num(c.attraction_count)) { toast('Reassign attractions before deleting a category in use.', true); return; }
    if (!window.confirm('Delete the custom category "' + c.name + '"?')) return;
    try { await api('admin/categories/' + num(id), { method:'DELETE', body:{} }); await refresh(); showCategories(); toast('Category deleted.'); }
    catch (error) { toast(error.message, true); }
  }
  async function refresh() {
    var result = await Promise.all([api('admin/dashboard'),api('admin/attractions'),api('admin/categories')]);
    dashboard = result[0]; attractions = result[1].items || []; categories = result[2].items || [];
  }
  function showLogin(message, error) {
    document.body.classList.remove('menu-open');
    app.innerHTML = '<main class="login-screen"><header class="login-top"><a href="../">Back to the public guide</a><span>FIELDNOTES / ADMINISTRATION</span></header><div class="login-layout">' +
      '<aside class="login-editorial"><div><div class="brand-monogram">FN</div><h1>Keep the local guide considered and current.</h1><p>Manage attraction information for visitors exploring Kirindiwela and Bandaranaikepura. Changes are saved to the project database.</p></div><div class="login-location"><strong>Fieldnotes guide office</strong>Kirindiwela &amp; Bandaranaikepura, Sri Lanka</div></aside>' +
      '<section class="login-card"><div class="page-eyebrow">Administrator access</div><h2>Sign in</h2><p>Use the administrator account created for this installation.</p><form id="login-form" autocomplete="off" novalidate>' +
      '<div class="login-field"><label for="username">Username</label><input class="field-control" id="username" name="admin-login-id" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="80" required></div>' +
      '<div class="login-field"><label for="password">Password</label><div class="password-line"><input class="field-control" id="password" name="admin-login-pass" type="password" autocomplete="new-password" required><button class="password-toggle" id="password-toggle" type="button" aria-pressed="false">Show</button></div></div>' +
      '<div id="login-error" class="login-error" role="alert"></div><button class="button button-primary login-submit" id="login-submit" type="submit">Sign in to the guide</button></form>' +
      (message ? '<div class="login-server-note' + (error ? ' is-error' : '') + '" role="status">' + esc(message) + (error ? ' You can retry after starting the documented PHP and MySQL services.' : '') + '</div>' : '') +
      '<p class="login-security">Administrator access is checked by the PHP server. Passwords are never stored in this page.</p></section></div></main>';
  }
  async function start() {
    try {
      var token = await api('csrf'); csrf = token.token || '';
      await refresh(); admin = dashboard.admin || { username:'Administrator' };
      shell(); showOverview();
    } catch (error) {
      if (error.status === 401) showLogin('',false);
      else showLogin(error.message || 'Administrator services are unavailable.',true);
    }
  }
  async function login() {
    var button = document.getElementById('login-submit'), err = document.getElementById('login-error');
    var username = document.getElementById('username').value.trim(), password = document.getElementById('password').value;
    err.textContent = '';
    if (!username || !password) { err.textContent = 'Enter both your username and password.'; return; }
    button.disabled = true; button.textContent = 'Signing in...';
    try {
      var token = await api('csrf'); csrf = token.token || csrf;
      var result = await api('auth/login',{method:'POST',body:{username:username,password:password}});
      csrf = result.csrf || csrf; admin = result.admin || {username:username};
      await refresh(); shell(); showOverview(); toast('Signed in. Guide data is up to date.');
    } catch (error) {
      err.textContent = error.status === 429 ? 'Too many attempts. Wait a little before trying again.' : (error.status === 401 ? 'The username or password is incorrect.' : error.message);
      button.disabled = false; button.textContent = 'Sign in to the guide';
      document.getElementById('password').value = ''; document.getElementById('password').focus();
    }
  }
  async function logout() {
    var button = document.querySelector('[data-action="logout"]');
    if (button) button.disabled = true;
    try {
      await api('auth/logout',{method:'POST',body:{}});
      admin = null; csrf = ''; dashboard = {}; attractions = []; categories = [];
      showLogin('You have signed out.',false);
    } catch (error) {
      if (button) button.disabled = false;
      toast(error.message || 'Sign out could not be completed. Try again.',true);
    }
  }
  document.addEventListener('click',function (event) {
    var target = event.target.closest('[data-action],[data-view]');
    if (target) {
      if (target.dataset.view) {
        var v = target.dataset.view;
        if (v === 'overview') showOverview();
        if (v === 'attractions') showAttractions();
        if (v === 'categories') showCategories();
      } else {
        var action = target.dataset.action, id = target.dataset.id;
        if (action === 'toggle-sidebar') { document.body.classList.toggle('menu-open'); target.setAttribute('aria-expanded',document.body.classList.contains('menu-open')?'true':'false'); }
        if (action === 'close-sidebar') document.body.classList.remove('menu-open');
        if (action === 'logout') logout();
        if (action === 'add-attraction') editAttraction(null);
        if (action === 'edit-attraction') editAttraction(id);
        if (action === 'delete-attraction') deleteAttraction(id);
        if (action === 'cancel-attraction') showAttractions();
        if (action === 'add-category') categoryForm({});
        if (action === 'edit-category') editCategory(id);
        if (action === 'delete-category') deleteCategory(id);
        if (action === 'cancel-category') showCategories();
        if (action === 'page-prev') { page = Math.max(1,page-1); attractionRows(); }
        if (action === 'page-next') { page += 1; attractionRows(); }
      }
    }
    if (event.target.id === 'password-toggle') {
      var password = document.getElementById('password'), show = password.type === 'password';
      password.type = show ? 'text' : 'password'; event.target.textContent = show ? 'Hide' : 'Show';
      event.target.setAttribute('aria-pressed',show?'true':'false'); password.focus();
    }
  });
  document.addEventListener('input',function (event) {
    if (event.target.id === 'attraction-search') { search = event.target.value; page = 1; attractionRows(); }
    if (event.target.id === 'category-search') filterCategories();
  });
  document.addEventListener('change',function (event) {
    if (event.target.id === 'attraction-category') { categoryFilter = event.target.value; page = 1; attractionRows(); }
    if (event.target.id === 'attraction-sort') { sortBy = event.target.value; page = 1; attractionRows(); }
  });
  document.addEventListener('submit',function (event) {
    if (event.target.id === 'login-form') { event.preventDefault(); login(); }
    if (event.target.id === 'attraction-form') { event.preventDefault(); if (event.target.reportValidity()) saveAttraction(event.target); }
    if (event.target.id === 'category-form') { event.preventDefault(); if (event.target.reportValidity()) saveCategory(event.target); }
  });
  start();
}());

