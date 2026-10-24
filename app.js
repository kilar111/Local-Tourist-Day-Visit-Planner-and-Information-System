/* Fieldnotes front end. Browsing and itinerary planning work without the API;
   administrator actions are always server-authenticated through PHP. */
const $ = (s) => document.querySelector(s),
  categoriesDefault = ["Nature", "Religious", "Heritage", "Recreational"];
const localImages = {
  "Attanagalla Rajamaha Viharaya":
    "images/attanagalla-rajamaha-viharaya.jpg",
  "Henarathgoda Botanical Garden":
    "images/henarathgoda-botanical-garden.jpg",
  "Horagolla National Park": "images/horagolla-national-park.jpg",
  "Kaleiliya Wetlands": "images/kaleiliya-wetlands.jpg",
  "Maligatenna Rajamaha Viharaya":
    "images/maligatenna-rajamaha-viharaya.jpg",
  "Mitirigala Nissarana Vanaya":
    "images/mitirigala-nissarana-vanaya.jpg",
  "Nittambuwa Clock Tower & surrounds":
    "images/nittambuwa-clock-tower.webp",
  "Pilikuttuwa Cave Temple": "images/pilikuttuwa-cave-temple.jpg",
  "Warana Rajamaha Viharaya": "images/warana-rajamaha-viharaya.jpg",
};
const fallback = [
  {
    id: 1,
    name: "Pilikuttuwa Cave Temple",
    categories: ["Religious", "Heritage"],
    distance_km: 9,
    short_description:
      "An ancient Buddhist site with natural caves and rock formations, suited to sightseeing, gentle hiking and photography.",
  },
  {
    id: 2,
    name: "Maligatenna Rajamaha Viharaya",
    categories: ["Religious", "Heritage"],
    distance_km: 8,
    short_description:
      "A historic Buddhist temple in a scenic setting, combining religious and natural surroundings.",
  },
  {
    id: 3,
    name: "Mitirigala Nissarana Vanaya",
    categories: ["Nature", "Religious"],
    distance_km: 7,
    short_description:
      "A forest monastery surrounded by dense greenery, offering a quiet setting for nature exploration and meditation.",
  },
  {
    id: 4,
    name: "Warana Rajamaha Viharaya",
    categories: ["Religious", "Heritage"],
    distance_km: 15,
    short_description:
      "An ancient Buddhist temple associated with caves, rocks and natural surroundings.",
  },
  {
    id: 5,
    name: "Attanagalla Rajamaha Viharaya",
    categories: ["Religious", "Heritage"],
    distance_km: 8,
    short_description:
      "A historically significant ancient Buddhist temple associated with the story of King Sri Sangabodhi.",
  },
  {
    id: 6,
    name: "Horagolla National Park",
    categories: ["Nature"],
    distance_km: 18,
    short_description:
      "A protected natural area known for biodiversity, greenery, nature walks and wildlife observation.",
  },
  {
    id: 7,
    name: "Kaleiliya Wetlands",
    categories: ["Nature"],
    distance_km: 18,
    short_description:
      "A natural wetland environment for nature observation, birdwatching, photography and outdoor visits.",
  },
  {
    id: 8,
    name: "Wathurugama Ambalama",
    categories: ["Heritage"],
    distance_km: 3,
    short_description:
      "A traditional historical structure representing local architecture and heritage.",
  },
  {
    id: 9,
    name: "Nittambuwa Clock Tower & surrounds",
    categories: ["Recreational"],
    distance_km: 13,
    short_description:
      "A recognizable local landmark with shops and food nearby, suitable for a short stop.",
  },
  {
    id: 10,
    name: "Henarathgoda Botanical Garden",
    categories: ["Nature", "Heritage"],
    distance_km: 19,
    short_description:
      "A historic botanical garden established in 1876 with varied plant life and landscaped grounds.",
  },
].map((p) => ({
  ...p,
  description: p.short_description,
  opening_hours: null,
  entrance_fee: null,
  fee_currency: "LKR",
  facilities: null,
  travel_tips: null,
  visit_minutes: null,
  latitude: null,
  longitude: null,
  image_url: localImages[p.name] || null,
}));
function norm(p) {
  return {
    ...p,
    id: Number(p.id),
    name: p.name,
    categories: Array.isArray(p.categories)
      ? p.categories
      : p.category
        ? [p.category]
        : [],
    distance_km: p.distance_km ?? p.distance ?? null,
    short_description:
      p.short_description || p.shortDescription || p.description || "",
    description: p.description || p.short_description || "",
    opening_hours: p.opening_hours ?? p.hours ?? null,
    entrance_fee: p.entrance_fee ?? p.fee ?? null,
    fee_currency: p.fee_currency || "LKR",
    facilities: p.facilities || null,
    travel_tips: p.travel_tips || p.tips || null,
    visit_minutes: p.visit_minutes ?? p.visitMinutes ?? null,
    latitude: p.latitude ?? p.lat ?? null,
    longitude: p.longitude ?? p.lon ?? null,
    image_url: p.image_url || localImages[p.name] || null,
  };
}
let places = fallback,
  plan = JSON.parse(localStorage.getItem("fieldnotes.plan") || "[]"),
  selectedCategories = new Set(),
  search = "",
  sort = "default",
  apiAvailable = false,
  allCategories = categoriesDefault.map((name, i) => ({
    id: i + 1,
    name,
    is_system: 1,
  }));
const persist = () => {
  localStorage.setItem("fieldnotes.plan", JSON.stringify(plan));
  localStorage.setItem("fieldnotes.settings", JSON.stringify(settings()));
};
function settings() {
  return {
    tripDate: $("#tripDate")?.value || "",
    departure: $("#departure")?.value || "08:00",
    availableHours: $("#availableHours")?.value || "",
    travelers: Math.max(1, Number($("#travelers")?.value || 1)),
    startLocation:
      $("#startLocation")?.value.trim() || "Bandaranaikepura, Sri Lanka",
    preferred: $("#preferred")?.value || "All",
  };
}
function esc(s = "") {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function catNames(p) {
  return p.categories?.length ? p.categories : ["Uncategorised"];
}
function catClass(p) {
  return (
    String(catNames(p)[0] || "nature")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "") || "nature"
  );
}
function km(p) {
  return p.distance_km == null
    ? "Distance to confirm"
    : `About ${p.distance_km} km from starting area`;
}
function money(n) {
  return n == null
    ? "Unknown"
    : `LKR ${Number(n).toLocaleString("en-LK", { maximumFractionDigits: 2 })}`;
}
function toast(msg) {
  let t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2400);
}
const apiUrl = () => new URL("api/index.php", document.baseURI).toString();
async function api(path, { method = "GET", body = null } = {}) {
  let h = { Accept: "application/json" };
  if (body !== null) h["Content-Type"] = "application/json";
  let r = await fetch(`${apiUrl()}?route=${encodeURIComponent(path)}`, {
    method,
    credentials: "same-origin",
    headers: h,
    body: body === null ? undefined : JSON.stringify(body),
  });
  let data = await r
    .json()
    .catch(() => ({ error: "The server returned an unreadable response." }));
  if (!r.ok)
    throw Object.assign(new Error(data.error || "Request failed."), {
      status: r.status,
      data,
    });
  return data;
}
function installSettings() {
  let s = JSON.parse(localStorage.getItem("fieldnotes.settings") || "{}");
  for (let [k, id] of Object.entries({
    tripDate: "tripDate",
    departure: "departure",
    availableHours: "availableHours",
    travelers: "travelers",
    startLocation: "startLocation",
  }))
    if (s[k] !== undefined && s[k] !== "") $("#" + id).value = s[k];
  if (s.preferred) $("#preferred").value = s.preferred;
  document.querySelectorAll("#planner input,#planner select").forEach((el) =>
    el.addEventListener("change", () => {
      persist();
      renderPlan();
    }),
  );
}
function render() {
  renderChips();
  $("#placeCount").textContent = places.length;
  $("#categoryCount").textContent = allCategories.length;
  let shown = places.filter(
    (p) =>
      (!selectedCategories.size ||
        catNames(p).some((c) => selectedCategories.has(c))) &&
      `${p.name} ${p.short_description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  if (sort === "distance")
    shown.sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
  if (sort === "name") shown.sort((a, b) => a.name.localeCompare(b.name));
  $("#cards").innerHTML = shown.length
    ? shown
        .map(
          (p) =>
            `<article class="card reveal in-view"><div class="card-img"><div class="art ${catClass(p)}"><span>${esc(catNames(p).join(" · "))}</span></div><span class="tag">${esc(catNames(p).join(" / "))}</span></div><div class="card-body"><div class="card-meta"><span>${esc(km(p))}</span><span>${p.visit_minutes ? `${p.visit_minutes} min` : "Visit time to confirm"}</span></div><h3>${esc(p.name)}</h3><p>${esc(p.short_description)}</p><div class="card-foot"><button class="text-button" onclick="details(${p.id})">Explore place ↗</button><button class="add-button ${plan.includes(p.id) ? "selected" : ""}" aria-label="${plan.includes(p.id) ? "Already in" : "Add"} day plan: ${esc(p.name)}" title="${plan.includes(p.id) ? "Already in plan" : "Add to day plan"}" onclick="addPlan(${p.id})">${plan.includes(p.id) ? "✓" : "+"}</button></div></div></article>`,
        )
        .join("")
    : '<div class="empty">No places match that search. Try another name or category.</div>';
  renderMapList();
  renderPlan();
}
function renderChips() {
  let names = ["All", ...allCategories.map((c) => c.name)];
  for (let c of [...selectedCategories])
    if (!names.includes(c)) selectedCategories.delete(c);
  $("#chips").innerHTML = names
    .map(
      (c) =>
        `<button class="chip ${(c === "All" ? !selectedCategories.size : selectedCategories.has(c)) ? "active" : ""}" aria-pressed="${c === "All" ? !selectedCategories.size : selectedCategories.has(c)}" data-cat="${esc(c)}">${esc(c)}</button>`,
    )
    .join("");
  document.querySelectorAll(".chip").forEach(
    (b) =>
      (b.onclick = () => {
        let c = b.dataset.cat;
        if (c === "All") selectedCategories.clear();
        else if (selectedCategories.has(c)) selectedCategories.delete(c);
        else selectedCategories.add(c);
        render();
      }),
  );
  let pref = $("#preferred"),
    old = pref.value;
  pref.innerHTML =
    '<option value="All">Any category</option>' +
    allCategories.map((c) => `<option>${esc(c.name)}</option>`).join("");
  if ([...pref.options].some((o) => o.value === old)) pref.value = old;
}
function renderMapList() {
  let list = places.slice(0, 10);
  $("#mapList").innerHTML = list.length
    ? list
        .map(
          (p, i) =>
            `<div class="map-row"><span class="num">${String(i + 1).padStart(2, "0")}</span><div><strong>${esc(p.name)}</strong><small>${esc(km(p))} · ${esc(catNames(p).join(" / "))}</small></div><button class="text-button" onclick="showMap(${p.id})">Map ↗</button></div>`,
        )
        .join("")
    : '<div class="map-note">No locations are available yet.</div>';
  $("#mapMapNote")?.remove();
}
function renderPlan() {
  let chosen = plan
      .map((id) => places.find((p) => Number(p.id) === Number(id)))
      .filter(Boolean),
    stops = chosen.length,
    knownMinutes = chosen.reduce((s, p) => s + Number(p.visit_minutes || 0), 0),
    unknownMinutes = chosen.filter((p) => !p.visit_minutes).length,
    travellers = settings().travelers,
    feePlaces = chosen.filter(
      (p) =>
        p.entrance_fee !== null &&
        p.entrance_fee !== "" &&
        Number.isFinite(Number(p.entrance_fee)),
    ),
    knownFees = feePlaces.reduce((s, p) => s + Number(p.entrance_fee), 0),
    unknownFees = chosen.filter(
      (p) => p.entrance_fee === null || p.entrance_fee === "",
    ).length;
  $("#navCount").textContent = stops;
  $("#planPlaces").textContent = stops;
  $("#planVisitTime").textContent = stops
    ? knownMinutes
      ? `${knownMinutes} min${unknownMinutes ? ` + ${unknownMinutes} unknown` : ""}`
      : `Unknown for ${stops} stop${stops === 1 ? "" : "s"}`
    : "—";
  $("#planKnownFees").textContent = money(feePlaces.length ? knownFees : null);
  $("#feePerPerson").textContent = "known subtotal per person";
  $("#planGroupFees").textContent = money(
    feePlaces.length ? knownFees * travellers : null,
  );
  $("#unknownFees").textContent =
    `group estimate · ${unknownFees} fee${unknownFees === 1 ? "" : "s"} unknown`;
  let advice = "Add a place to see your day summary.";
  if (stops) {
    advice = `${stops} stop${stops === 1 ? "" : "s"} in your plan. Fees exclude unknown attractions, transport, food and personal expenses.`;
    let avail = Number(settings().availableHours);
    if (avail && knownMinutes > avail * 60)
      advice = `Your known visit time alone is ${Math.floor(knownMinutes / 60)}h ${knownMinutes % 60}m, which exceeds your ${avail}h available. Travel time is not included.`;
    else if (avail && unknownMinutes)
      advice += ` ${unknownMinutes} visit duration${unknownMinutes === 1 ? " is" : "s are"} unrecorded, so total day length cannot be estimated.`;
  }
  $("#planAdvice").textContent = advice;
  $("#planDistances").innerHTML = chosen.length
    ? `<b>Distances from the starting area:</b> ${chosen.map((p) => `${esc(p.name)} — ${p.distance_km == null ? "unconfirmed" : `${p.distance_km} km`}`).join(" · ")}. These are not between-stop route distances. <span>Unknown fees are excluded from totals; a listed fee is treated as per traveller.</span>`
    : "Distance estimates will appear here when places are selected. No multi-stop route distance is available.";
  $("#itinItems").innerHTML = chosen.length
    ? chosen
        .map(
          (p, i) =>
            `<div class="itin-item" draggable="true" data-index="${i}" ondragstart="dragStart(event)" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="dropStop(event)" ondragend="dragEnd(event)"><span class="drag-handle" aria-hidden="true">⠿</span><span class="itin-time">${String(i + 1).padStart(2, "0")}</span><div style="flex:1;min-width:0"><strong>${esc(p.name)}</strong><small>${esc(catNames(p).join(" / "))} · ${esc(km(p))} · ${p.visit_minutes ? `${p.visit_minutes} min visit` : "duration unknown"}</small></div><button title="View details" aria-label="View ${esc(p.name)} details" onclick="details(${p.id})">ⓘ</button><button title="Move up" aria-label="Move ${esc(p.name)} up" onclick="movePlan(${i},-1)" ${i === 0 ? "disabled" : ""}>↑</button><button title="Move down" aria-label="Move ${esc(p.name)} down" onclick="movePlan(${i},1)" ${i === chosen.length - 1 ? "disabled" : ""}>↓</button><button title="Remove" aria-label="Remove ${esc(p.name)}" onclick="removePlan(${p.id})">×</button></div>`,
        )
        .join("")
    : '<div class="itin-empty">Your day is still open.<br>Add a place from the guide to begin.</div>';
  let preferred = settings().preferred,
    suggest = places
      .filter(
        (p) =>
          !plan.includes(p.id) &&
          (preferred === "All" || catNames(p).includes(preferred)),
      )
      .sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999))
      .slice(0, 3);
  let old = $("#suggestions");
  if (old) old.remove();
  if (suggest.length) {
    let wrap = document.createElement("div");
    wrap.id = "suggestions";
    wrap.className = "map-note";
    wrap.innerHTML = `<b>${preferred === "All" ? "Nearby ideas" : "Ideas in " + esc(preferred)}</b> <span style="font-size:10px">ranked by distance from start</span><div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:7px">${suggest.map((p) => `<button class="text-button" onclick="addPlan(${p.id})">+ ${esc(p.name)} (${p.distance_km ?? "?"} km)</button>`).join("")}</div>`;
    $("#itinItems").after(wrap);
  }
  persist();
}
function addPlan(id) {
  if (plan.includes(id)) return toast("That place is already in your plan.");
  plan.push(id);
  render();
  toast("Added to your day plan.");
}
function removePlan(id) {
  plan = plan.filter((x) => Number(x) !== Number(id));
  render();
  toast("Removed from your plan.");
}
function movePlan(i, d) {
  let j = i + d;
  if (j < 0 || j >= plan.length) return;
  [plan[i], plan[j]] = [plan[j], plan[i]];
  render();
}
let dragIndex = null;
function dragStart(e) {
  dragIndex = Number(e.currentTarget.dataset.index);
  e.currentTarget.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", String(dragIndex));
}
function dragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add("drop-target");
}
function dragLeave(e) {
  e.currentTarget.classList.remove("drop-target");
}
function dragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  document
    .querySelectorAll(".drop-target")
    .forEach((x) => x.classList.remove("drop-target"));
}
function dropStop(e) {
  e.preventDefault();
  let target = Number(e.currentTarget.dataset.index),
    from = dragIndex;
  if (Number.isInteger(from) && from !== target) {
    let [item] = plan.splice(from, 1);
    plan.splice(target, 0, item);
    render();
    toast("Itinerary order updated.");
  }
  dragEnd(e);
}
function details(id) {
  let p = places.find((x) => Number(x.id) === Number(id));
  openModal(
    `<div class="modal-top"><div><div class="eyebrow">${esc(catNames(p).join(" · "))} · ${esc(km(p))}</div><h2>${esc(p.name)}</h2></div><button class="close" onclick="closeModal()" aria-label="Close">×</button></div><div class="art ${catClass(p)}" style="height:170px;border-radius:6px;margin-bottom:17px"><span>${esc(catNames(p).join(" · "))}</span></div><p class="detail-copy">${esc(p.description)}</p><div class="detail-grid"><div class="detail-box"><span>Opening hours</span><b>${esc(p.opening_hours || "Confirm locally")}</b></div><div class="detail-box"><span>Entrance fee</span><b>${p.entrance_fee == null ? "Unknown — confirm locally" : Number(p.entrance_fee) === 0 ? "Confirmed free" : money(p.entrance_fee)}</b></div><div class="detail-box"><span>Facilities</span><b>${esc(p.facilities || "Confirm locally")}</b></div><div class="detail-box"><span>Estimated visit</span><b>${p.visit_minutes ? `${p.visit_minutes} minutes` : "Not recorded"}</b></div></div><p class="detail-copy"><b style="color:var(--ink)">Travel note</b><br>${esc(p.travel_tips || "Confirm access, opening details and visitor guidance with the attraction before travelling.")}</p><div class="hero-actions"><button class="button primary" onclick="addPlan(${p.id})">Add to day plan</button><button class="button secondary" onclick="showMap(${p.id})">View map ↗</button><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + " Kirindiwela Sri Lanka")}"><button class="button secondary">Directions ↗</button></a></div><p class="detail-copy" style="font-size:10px;margin:16px 0 0">Details not marked as verified are indicative or require confirmation. Distances are proposal estimates from the project area.</p>`,
  );
}
const renderBase = render;
render = function () {
  renderBase();
  document.querySelectorAll(".card").forEach((card) => {
    let p = places.find(
      (x) => x.name === card.querySelector("h3")?.textContent,
    );
    if (p?.image_url) {
      let img = document.createElement("img");
      img.src = p.image_url;
      img.alt = `Representative image for ${p.name}`;
      img.loading = "lazy";
      img.onerror = () => img.remove();
      card.querySelector(".card-img").prepend(img);
    }
  });
};
const planBase = renderPlan;
renderPlan = function () {
  planBase();
  let box = $("#timeRemainder"),
    chosen = plan
      .map((id) => places.find((p) => Number(p.id) === Number(id)))
      .filter(Boolean),
    avail = Number(settings().availableHours);
  if (!box) return;
  if (!chosen.length || !avail) {
    box.textContent =
      "Set an available trip duration to estimate remaining visit time.";
    return;
  }
  if (chosen.some((p) => !p.visit_minutes)) {
    box.textContent =
      "Remaining time cannot be estimated because one or more visit durations are unknown. Travel time is not included.";
    return;
  }
  let remaining =
    avail * 60 - chosen.reduce((sum, p) => sum + Number(p.visit_minutes), 0);
  box.textContent =
    remaining >= 0
      ? `About ${Math.floor(remaining / 60)}h ${remaining % 60}m remains after recorded visits; this excludes all travel time and breaks.`
      : `Recorded visits exceed the available time by ${Math.floor(Math.abs(remaining) / 60)}h ${Math.abs(remaining) % 60}m, before travel time.`;
};
const detailsBase = details;
details = function (id) {
  detailsBase(id);
  let p = places.find((x) => Number(x.id) === Number(id));
  if (p?.image_url) {
    let art = $("#modalContent .art");
    if (art) {
      let fallbackArt = art.cloneNode(true),
        img = document.createElement("img");
      img.className = "detail-photo";
      img.src = p.image_url;
      img.alt = `Representative image for ${p.name}`;
      img.onerror = () => img.replaceWith(fallbackArt);
      art.replaceWith(img);
    }
  }
};
function showMap(id) {
  let p = places.find((x) => Number(x.id) === Number(id));
  if (!p) return;
  let query =
      p.latitude != null && p.longitude != null
        ? `${p.latitude},${p.longitude}`
        : `${p.name}, Kirindiwela, Sri Lanka`,
    q = encodeURIComponent(query);
  $("#mapFrame").src = `https://www.google.com/maps?q=${q}&output=embed`;
  $("#mapCaption").textContent =
    `${p.latitude != null ? "Recorded map coordinates" : "Search map"} for ${p.name} · confirm exact location`;
  $("#mapFallbackLink").href =
    `https://www.google.com/maps/search/?api=1&query=${q}`;
  document
    .querySelector("#map")
    .scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  history.replaceState(null, "", "#map");
}
function openPlanRoute() {
  let stops = plan
    .map((id) => places.find((p) => Number(p.id) === Number(id)))
    .filter(Boolean);
  if (!stops.length) return toast("Add a place before opening a route.");
  let loc = (p) =>
    p.latitude != null && p.longitude != null
      ? `${p.latitude},${p.longitude}`
      : `${p.name}, Kirindiwela, Sri Lanka`;
  let destination = loc(stops[stops.length - 1]),
    waypoints = stops.length > 1 ? stops.slice(0, -1).map(loc).join("|") : "";
  let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(settings().startLocation)}&destination=${encodeURIComponent(destination)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}&travelmode=driving`;
  window.open(url, "_blank", "noopener,noreferrer");
}
function openModal(html) {
  $("#modalContent").innerHTML = html;
  $("#modal").classList.add("open");
  $("#modalContent").querySelector("input,button")?.focus();
}
function closeModal() {
  $("#modal").classList.remove("open");
}
$("#modal").onclick = (e) => {
  if (e.target === $("#modal")) closeModal();
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});
$("#search").oninput = (e) => {
  search = e.target.value;
  render();
};
$("#sort").onchange = (e) => {
  sort = e.target.value;
  render();
};
$("#clearPlan").onclick = () => {
  if (plan.length && confirm("Clear every stop from your day plan?")) {
    plan = [];
    render();
    toast("Your itinerary is clear.");
  }
};
$("#newPlan").onclick = () => {
  if (
    plan.length &&
    confirm("Start a new plan and remove all current stops?")
  ) {
    plan = [];
    render();
    toast("Started a new day plan.");
  }
};
$("#printPlan").onclick = () => {
  if (!plan.length) return toast("Add a place before printing your plan.");
  window.print();
};
$("#sharePlan").onclick = async () => {
  let list = plan
      .map((id, i) => {
        let p = places.find((x) => Number(x.id) === Number(id));
        return `${i + 1}. ${p.name} — ${km(p)}; visit ${p.visit_minutes ? `${p.visit_minutes} min` : "time unknown"}; fee ${p.entrance_fee == null ? "unknown" : money(p.entrance_fee)}`;
      })
      .join("\n"),
    text = `Fieldnotes day plan\nDate: ${settings().tripDate || "not set"} · Departure: ${settings().departure}\n${list}\n\nDistances are from the starting area, not between stops. Check fees and hours before travel.`;
  try {
    await navigator.clipboard.writeText(text);
    toast("Itinerary copied to clipboard.");
  } catch {
    openModal(
      `<div class="modal-top"><h2>Share your plan</h2><button class="close" onclick="closeModal()">×</button></div><textarea style="width:100%;min-height:210px;padding:12px" readonly>${esc(text)}</textarea><p class="detail-copy">Select and copy the itinerary text.</p>`,
    );
  }
};
async function loadPublicData() {
  try {
    let [pr, cr] = await Promise.all([api("attractions"), api("categories")]);
    if (Array.isArray(pr.items)) {
      places = pr.items.map(norm);
      apiAvailable = true;
    }
    if (Array.isArray(cr.items) && cr.items.length) allCategories = cr.items;
    render();
  } catch {
    apiAvailable = false;
  }
}
$("#openRoute").onclick = openPlanRoute;
installSettings();
render();
$("#search").setAttribute("autocomplete", "off");
if (
  !matchMedia("(prefers-reduced-motion: reduce)").matches &&
  "IntersectionObserver" in window
) {
  let io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in-view");
          io.unobserve(e.target);
        }
      }),
    { threshold: 0.08 },
  );
  document.querySelectorAll(".section-head,.guide article").forEach((e) => {
    e.classList.add("reveal");
    io.observe(e);
  });
}
loadPublicData().then(render);
