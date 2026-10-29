(async function () {
  var sb = window.getSupabase();
  var COLS = [
    { key: "todo", label: "To Do" },
    { key: "in_progress", label: "In Progress" },
    { key: "review", label: "Review" },
    { key: "done", label: "Done" },
  ];
  var state = { me: null, profiles: [], tasks: [], editing: null, q: "", who: "", urls: {}, keep: [], pending: [] };
  var $ = function (id) { return document.getElementById(id); };

  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 2400);
  }

  // ---- Auth gate ----
  var s = await sb.auth.getSession();
  if (!s.data.session) { location.replace("login.html"); return; }
  state.me = s.data.session.user;

  sb.auth.onAuthStateChange(function (ev) {
    if (ev === "SIGNED_OUT") location.replace("login.html");
  });
  $("logout").addEventListener("click", function () { sb.auth.signOut(); });

  // ---- Load data ----
  async function load() {
    var p = await sb.from("profiles").select("*").order("created_at");
    var t = await sb.from("tasks").select("*").order("created_at", { ascending: false });
    if (p.error || t.error) {
      toast("Could not load data. Did you run the SQL? " + ((p.error || t.error).message || ""));
      return;
    }
    state.profiles = p.data || [];
    state.tasks = t.data || [];
    var paths = [];
    state.tasks.forEach(function (x) { (x.images || []).forEach(function (a) { if (!state.urls[a]) paths.push(a); }); });
    if (paths.length) {
      var su = await sb.storage.from("task-images").createSignedUrls(paths, 3600);
      (su.data || []).forEach(function (r) { if (r.signedUrl) state.urls[r.path] = r.signedUrl; });
    }
  }
  await load();

  function profile(id) { return state.profiles.find(function (x) { return x.id === id; }); }
  function nameOf(id) { var p = profile(id); return p ? p.display_name : "Unassigned"; }

  // ---- Sidebar / filters ----
  function renderPeople() {
    var meP = profile(state.me.id);
    var meName = (meP && meP.display_name) || state.me.email.split("@")[0];
    $("meName").textContent = meName;
    var av = $("meAvatar"); av.textContent = initials(meName); av.style.background = colorFor(state.me.id);

    $("members").innerHTML = state.profiles.map(function (p) {
      var working = state.tasks.filter(function (t) { return t.assignee === p.id && t.status === "in_progress"; });
      var sub = working.length ? "Working on: " + esc(working[0].title) : "Not working on anything";
      return '<div class="member"><div class="avatar" style="background:' + colorFor(p.id) + '">' +
        esc(initials(p.display_name)) + '<span class="dot"></span></div><div>' +
        esc(p.display_name) + "<small>" + sub + "</small></div></div>";
    }).join("");

    var opts = '<option value="">Everyone</option>' + state.profiles.map(function (p) {
      return '<option value="' + p.id + '">' + esc(p.display_name) + "</option>";
    }).join("");
    var cur = $("filterAssignee").value;
    $("filterAssignee").innerHTML = opts; $("filterAssignee").value = cur;

    $("fAssignee").innerHTML = '<option value="">Unassigned</option>' + state.profiles.map(function (p) {
      return '<option value="' + p.id + '">' + esc(p.display_name) + "</option>";
    }).join("");
  }

  // ---- Stats ----
  function renderStats() {
    var total = state.tasks.length;
    var done = state.tasks.filter(function (t) { return t.status === "done"; }).length;
    var pct = total ? Math.round((done / total) * 100) : 0;
    $("pct").textContent = pct + "%";
    $("kInProg").textContent = state.tasks.filter(function (t) { return t.status === "in_progress"; }).length;
    $("kVisits").textContent = (window.APP_CONFIG.FALLBACK_VISITS || 0).toLocaleString();

    // gauge: tick marks, filled up to pct
    var ticks = "", n = 36;
    for (var i = 0; i < n; i++) {
      var a = Math.PI + (Math.PI * i) / (n - 1);
      var x1 = 100 + Math.cos(a) * 78, y1 = 100 + Math.sin(a) * 78;
      var x2 = 100 + Math.cos(a) * 94, y2 = 100 + Math.sin(a) * 94;
      var on = (i / (n - 1)) * 100 <= pct && pct > 0;
      ticks += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) +
        '" stroke="' + (on ? "#232321" : "#c9cab0") + '" stroke-width="2.4" stroke-linecap="round"/>';
    }
    $("gaugeSvg").innerHTML = ticks;

    // bars: tasks finished per weekday this week (Mon..Fri)
    var now = new Date();
    var monday = new Date(now); monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    var counts = [0, 0, 0, 0, 0];
    state.tasks.forEach(function (t) {
      if (t.status !== "done" || !t.completed_at) return;
      var d = new Date(t.completed_at);
      var idx = Math.floor((d - monday) / 86400000);
      if (idx >= 0 && idx < 5) counts[idx]++;
    });
    var max = Math.max.apply(null, counts.concat([1]));
    var days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    $("bars").innerHTML = counts.map(function (c, i) {
      var h = c ? Math.max(12, (c / max) * 80) : 8;
      return '<div class="bar-col"><div class="bar ' + (c ? "" : "empty") + '" style="height:' + h + 'px"></div><span>' + days[i] + "</span></div>";
    }).join("");
  }

  // ---- Board ----
  function fmtDate(d) {
    if (!d) return "No due date";
    var dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  }
  function visible(t) {
    if (state.who && t.assignee !== state.who) return false;
    if (state.q) {
      var hay = (t.title + " " + (t.description || "")).toLowerCase();
      if (hay.indexOf(state.q.toLowerCase()) === -1) return false;
    }
    return true;
  }
  function renderBoard() {
    $("board").innerHTML = COLS.map(function (c) {
      var items = state.tasks.filter(function (t) { return t.status === c.key && visible(t); });
      var cards = items.map(function (t) {
        var prio = t.priority === "high" ? "prio-high" : t.priority === "low" ? "prio-low" : "prio-med";
        var who = t.assignee ? nameOf(t.assignee) : "Unassigned";
        var imgs = (t.images || []).filter(function (a) { return state.urls[a]; });
        var imgHtml = imgs.length ? '<div class="card-img" data-zoom="' + esc(state.urls[imgs[0]]) + '"><img src="' + esc(state.urls[imgs[0]]) + '" alt="" loading="lazy" draggable="false" />' +
          (imgs.length > 1 ? '<span class="more">+' + (imgs.length - 1) + "</span>" : "") + "</div>" : "";
        return '<div class="card' + (t.status === "done" ? " done" : "") + '" draggable="true" data-id="' + t.id + '">' + imgHtml +
          '<div class="top"><h5>' + esc(t.title) + '</h5><button class="menu" data-edit="' + t.id + '" title="Edit">⋮</button></div>' +
          "<p>" + esc(t.description || "") + "</p>" +
          '<div class="meta"><span class="tagpill">📅 ' + fmtDate(t.due_date) + '</span>' +
          '<span class="tagpill ' + prio + '">' + esc(t.priority) + "</span>" +
          '<span class="assignee"><span class="avatar sm" style="background:' + (t.assignee ? colorFor(t.assignee) : "#aaa") + '">' +
          esc(initials(who)) + "</span>" + esc(who.split(" ")[0]) + "</span></div></div>";
      }).join("") || '<div class="empty-note">Nothing here yet</div>';
      return '<div><div class="col-head"><h3>' + c.label + '</h3><span class="count-pill">' + items.length +
        '</span></div><div class="col-body" data-col="' + c.key + '">' + cards + "</div></div>";
    }).join("");
    wireDnD();
  }

  function wireDnD() {
    document.querySelectorAll(".card").forEach(function (el) {
      el.addEventListener("dragstart", function (e) {
        el.classList.add("dragging"); e.dataTransfer.setData("text/plain", el.dataset.id);
      });
      el.addEventListener("dragend", function () { el.classList.remove("dragging"); });
    });
    document.querySelectorAll(".col-body").forEach(function (col) {
      col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("over"); });
      col.addEventListener("dragleave", function () { col.classList.remove("over"); });
      col.addEventListener("drop", async function (e) {
        e.preventDefault(); col.classList.remove("over");
        var id = e.dataTransfer.getData("text/plain");
        await setStatus(id, col.dataset.col);
      });
    });
    document.querySelectorAll("[data-zoom]").forEach(function (el) {
      el.addEventListener("click", function () { $("lbImg").src = el.dataset.zoom; $("lightbox").classList.add("open"); });
    });
    document.querySelectorAll("[data-edit]").forEach(function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); openModal(b.dataset.edit); });
    });
  }

  async function setStatus(id, status) {
    var t = state.tasks.find(function (x) { return String(x.id) === String(id); });
    if (!t || t.status === status) return;
    var patch = { status: status, completed_at: status === "done" ? new Date().toISOString() : null };
    var r = await sb.from("tasks").update(patch).eq("id", t.id);
    if (r.error) { toast(r.error.message); return; }
    Object.assign(t, patch);
    renderAll();
  }

  // ---- Modal ----
  function openModal(id) {
    var t = id ? state.tasks.find(function (x) { return String(x.id) === String(id); }) : null;
    state.editing = t || null;
    $("modalTitle").textContent = t ? "Edit task" : "New task";
    $("fTitle").value = t ? t.title : "";
    $("fDesc").value = t ? t.description || "" : "";
    $("fAssignee").value = t ? t.assignee || "" : state.me.id;
    $("fPrio").value = t ? t.priority : "medium";
    $("fStatus").value = t ? t.status : "todo";
    $("fDue").value = t ? t.due_date || "" : "";
    $("delBtn").style.display = t ? "block" : "none";
    state.keep = t ? (t.images || []).slice() : [];
    state.pending = [];
    $("fFiles").value = "";
    renderThumbs();
    $("modalBg").classList.add("open");
    $("fTitle").focus();
  }
  function renderThumbs() {
    var h = state.keep.map(function (a, i) {
      return '<div class="thumb"><img src="' + esc(state.urls[a] || "") + '" alt="" /><button type="button" data-rk="' + i + '">×</button></div>';
    }).join("") + state.pending.map(function (f, i) {
      return '<div class="thumb"><img src="' + URL.createObjectURL(f) + '" alt="" /><button type="button" data-rp="' + i + '">×</button></div>';
    }).join("");
    $("thumbs").innerHTML = h;
    $("thumbs").querySelectorAll("[data-rk]").forEach(function (b) {
      b.addEventListener("click", function () { state.keep.splice(+b.dataset.rk, 1); renderThumbs(); });
    });
    $("thumbs").querySelectorAll("[data-rp]").forEach(function (b) {
      b.addEventListener("click", function () { state.pending.splice(+b.dataset.rp, 1); renderThumbs(); });
    });
  }
  function addFiles(list) {
    Array.prototype.forEach.call(list, function (f) {
      if (!/^image\//.test(f.type)) return;
      if (f.size > 8 * 1024 * 1024) { toast(f.name + " is over 8 MB"); return; }
      state.pending.push(f);
    });
    renderThumbs();
  }
  $("fFiles").addEventListener("change", function (e) { addFiles(e.target.files); e.target.value = ""; });
  document.addEventListener("paste", function (e) {
    if (!$("modalBg").classList.contains("open") || !e.clipboardData) return;
    addFiles(e.clipboardData.files);
  });
  $("lightbox").addEventListener("click", function () { $("lightbox").classList.remove("open"); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { $("lightbox").classList.remove("open"); closeModal(); }
  });

  function closeModal() { $("modalBg").classList.remove("open"); }
  $("addBtn").addEventListener("click", function () { openModal(null); });
  $("cancelBtn").addEventListener("click", closeModal);
  $("modalBg").addEventListener("click", function (e) { if (e.target === $("modalBg")) closeModal(); });

  $("taskForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var status = $("fStatus").value;
    var row = {
      title: $("fTitle").value.trim(),
      description: $("fDesc").value.trim(),
      assignee: $("fAssignee").value || null,
      priority: $("fPrio").value,
      status: status,
      due_date: $("fDue").value || null,
    };
    var saveBtn = e.submitter; if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving..."; }
    var uploaded = [];
    for (var i = 0; i < state.pending.length; i++) {
      var f = state.pending[i];
      var safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      var path = state.me.id + "/" + Date.now() + "-" + i + "-" + safe;
      var up = await sb.storage.from("task-images").upload(path, f, { contentType: f.type });
      if (up.error) {
        toast("Upload failed: " + up.error.message);
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save"; }
        return;
      }
      uploaded.push(path);
    }
    row.images = state.keep.concat(uploaded);
    var r;
    if (state.editing) {
      if (state.editing.status !== status) row.completed_at = status === "done" ? new Date().toISOString() : null;
      r = await sb.from("tasks").update(row).eq("id", state.editing.id);
    } else {
      row.created_by = state.me.id;
      if (status === "done") row.completed_at = new Date().toISOString();
      r = await sb.from("tasks").insert(row);
    }
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save"; }
    if (r.error) { toast(r.error.message); return; }
    if (state.editing) {
      var removed = (state.editing.images || []).filter(function (a) { return state.keep.indexOf(a) === -1; });
      if (removed.length) await sb.storage.from("task-images").remove(removed);
    }
    closeModal(); await load(); renderAll(); toast("Saved");
  });

  $("delBtn").addEventListener("click", async function () {
    if (!state.editing || !confirm("Delete this task?")) return;
    var r = await sb.from("tasks").delete().eq("id", state.editing.id);
    if (r.error) { toast(r.error.message); return; }
    if ((state.editing.images || []).length) await sb.storage.from("task-images").remove(state.editing.images);
    closeModal(); await load(); renderAll(); toast("Deleted");
  });

  $("search").addEventListener("input", function (e) { state.q = e.target.value; renderBoard(); });
  $("filterAssignee").addEventListener("change", function (e) { state.who = e.target.value; renderBoard(); });

  // live updates so both of you see changes
  sb.channel("tasks-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, async function () {
      await load(); renderAll();
    })
    .subscribe();

  function renderAll() { renderPeople(); renderStats(); renderBoard(); }
  renderAll();
  $("app").style.visibility = "visible";
})();
