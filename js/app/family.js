// Profiles, parent PIN, parent tools, sync, settings and about screens.

// ----- screens -----
function ProfilesView() {
  return {
    tab: "profiles",
    render(el) {
      const list = Profiles.all();
      el.innerHTML = `<section class="profiles">
        <h1>Who's watching?</h1>
        <div class="profile-list">
          ${list.map((p) => `<button class="f profile${profile && profile.id === p.id ? " current" : ""}" data-id="${p.id}">
            ${Profiles.avatar(p)}<b>${escapeHtml(p.name)}</b><small>${p.group}${p.locked && Profiles.hasPin() ? " · Locked" : ""}</small></button>`).join("")}
          ${list.length < MAX_PROFILES ? `<button class="f profile add" id="add-profile"><span class="pic">+</span><b>Add profile</b><small>&nbsp;</small></button>` : ""}
        </div>
        <div class="btns center">
          <button class="f btn" id="manage">Manage profiles &amp; parent PIN</button>
          <button class="f btn" id="be-remote">Use this phone as a remote</button>
          <button class="f btn" id="settings-btn">Settings</button>
          <button class="f btn" id="about-btn">About &amp; credits</button>
          ${installButton()}
        </div>
      </section>`;
      el.querySelector("#be-remote").addEventListener("click", () => go(PhoneRemoteView()));
      el.querySelector("#settings-btn").addEventListener("click", () => go(SettingsView()));
      el.querySelector("#about-btn").addEventListener("click", () => go(AboutView()));
      wireInstall(el);
      el.querySelectorAll(".profile[data-id]").forEach((b) => b.addEventListener("click", () => {
        const p = Profiles.get(b.dataset.id);
        const enter = () => { setProfile(p); openTab("home"); };
        if (!p.locked) return enter();
        if (Profiles.hasPin()) return go(PinView({ mode: "check", title: `Enter the parent PIN for ${p.name}`, onDone: enter }));
        // First locked profile ever chosen: the parent sets up a PIN.
        go(PinView({ mode: "create", title: "Set up a parent PIN", note: `${p.name} is locked so younger kids can't open it. Choose 4 numbers only parents know.`, onDone: enter }));
      }));
      const add = el.querySelector("#add-profile");
      if (add) add.addEventListener("click", () => withParent(() => EditProfileView(null)));
      el.querySelector("#manage").addEventListener("click", () => withParent(() => ParentView()));
      SpatialNav.focus(el.querySelector(".profile.current") || el.querySelector(".profile"));
    },
  };
}

// Runs `fn` after the parent PIN is entered (or right away if no PIN is set yet).
// Opens a parent-only screen, asking for the parent PIN first when one is set.
function withParent(makeView) {
  if (!Profiles.hasPin()) return go(makeView());
  go(PinView({ mode: "check", title: "Enter the parent PIN", onDone: () => mount(makeView()) }));
}

// Number pad that works with a controller, remote, keyboard or touch.
function PinView({ mode, title, note = "", onDone }) {
  let digits = "", first = null, stage = mode; // stage: "check" | "create" | "confirm"
  let el;
  const prompts = { check: title, create: title, confirm: "Enter the same PIN again" };
  function draw() {
    el.querySelector("#pin-title").textContent = prompts[stage];
    el.querySelector("#pin-dots").innerHTML = [0, 1, 2, 3].map((i) => `<i class="${i < digits.length ? "on" : ""}"></i>`).join("");
  }
  async function complete() {
    if (stage === "check") {
      if (await Profiles.checkPin(digits)) { onDone(); return; }
      digits = ""; draw(); toast("Wrong PIN. Try again.");
    } else if (stage === "create") {
      first = digits; digits = ""; stage = "confirm"; draw();
    } else {
      if (digits === first) { await Profiles.setPin(digits); toast("Parent PIN saved"); stack.pop(); onDone(); return; }
      digits = ""; first = null; stage = "create"; draw(); toast("Those didn't match. Start again.");
    }
  }
  function press(k) {
    if (k === "del") digits = digits.slice(0, -1);
    else if (k === "clear") digits = "";
    else if (digits.length < 4) digits += k;
    draw();
    if (digits.length === 4) setTimeout(complete, 150);
  }
  return {
    tab: "profiles",
    render(root) {
      el = root;
      const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "del"];
      root.innerHTML = `<section class="pin">
        <h1 id="pin-title"></h1>
        ${note ? `<p class="sub">${escapeHtml(note)}</p>` : ""}
        <div class="pin-dots" id="pin-dots"></div>
        <div class="pad-grid">${keys.map((k) => `<button class="f key-btn" data-k="${k}">${k === "del" ? "⌫" : k === "clear" ? "Clear" : k}</button>`).join("")}</div>
        ${mode === "check" ? `<p class="sub small">Forgot the PIN? Clear this site's data in the browser settings to reset it.</p>` : ""}
      </section>`;
      root.querySelectorAll(".key-btn").forEach((b) => b.addEventListener("click", () => press(b.dataset.k)));
      draw();
      SpatialNav.focus(root.querySelector('[data-k="5"]'));
    },
    onAction(action, ev) {
      // Number keys on a keyboard type digits (they don't mean A/B/X/Y here).
      if (ev && /^[0-9]$/.test(ev.key)) { press(ev.key); return true; }
      if (ev && ev.key === "Backspace") { press("del"); return true; }
      return false;
    },
  };
}

function ParentView() {
  return {
    tab: "profiles",
    render(el) {
      const list = Profiles.all();
      el.innerHTML = `<section class="page narrow">
        <h1>Manage profiles</h1>
        <p class="sub">Pick a profile to change its name, picture or age group.</p>
        <div class="manage-list">
          ${list.map((p) => `<button class="f manage-row" data-id="${p.id}">${Profiles.avatar(p)}<span><b>${escapeHtml(p.name)}</b><small>${p.group}${p.locked ? " · Needs parent PIN" : ""}</small></span><span class="go">Edit</span></button>`).join("")}
        </div>
        <div class="btns">
          ${list.length < MAX_PROFILES ? `<button class="f btn gold" id="add">+ Add profile</button>` : ""}
          <button class="f btn" id="pin">${Profiles.hasPin() ? "Change parent PIN" : "Set up parent PIN"}</button>
          ${Profiles.hasPin() ? `<button class="f btn" id="nopin">Turn off parent PIN</button>` : ""}
          <button class="f btn" id="history">Watch history</button>
          <button class="f btn" id="hidden-btn">Hidden movies</button>
          <button class="f btn" id="sync-btn">Sync devices</button>
          ${installButton()}
          <button class="f btn" id="done">Done</button>
        </div>
        <h2 class="section-title">App look</h2>
        <p class="sub">Holiday looks switch on by themselves around each holiday. You can also pick one.</p>
        <div class="chips" id="looks">
          ${[["auto", "Automatic (holidays)"], ...Object.entries(Theme.LOOKS).map(([k, v]) => [k, v.name])].map(([k, name]) => `<button class="f chip-btn${Theme.setting() === k ? " on" : ""}" data-look="${k}">${name}</button>`).join("")}
        </div>
      </section>`;
      el.querySelector("#history").addEventListener("click", () => go(WatchHistoryView()));
      el.querySelector("#hidden-btn").addEventListener("click", () => go(HiddenView()));
      el.querySelector("#sync-btn").addEventListener("click", () => go(SyncView()));
      el.querySelectorAll("[data-look]").forEach((b) => b.addEventListener("click", () => {
        Theme.set(b.dataset.look);
        el.querySelectorAll("[data-look]").forEach((x) => x.classList.toggle("on", x === b));
        toast(`Look: ${b.textContent}`);
      }));
      wireInstall(el);
      el.querySelectorAll(".manage-row").forEach((b) => b.addEventListener("click", () => go(EditProfileView(Profiles.get(b.dataset.id)))));
      const add = el.querySelector("#add");
      if (add) add.addEventListener("click", () => go(EditProfileView(null)));
      el.querySelector("#pin").addEventListener("click", () => go(PinView({ mode: "create", title: "Choose a new parent PIN", onDone: () => mount(ParentView()) })));
      const nopin = el.querySelector("#nopin");
      if (nopin) nopin.addEventListener("click", () => { Profiles.clearPin(); toast("Parent PIN turned off"); mount(ParentView()); });
      el.querySelector("#done").addEventListener("click", () => openTab("profiles"));
      SpatialNav.focus(el.querySelector(".manage-row"));
    },
  };
}

function EditProfileView(existing) {
  const p = existing ? { ...existing } : { id: Profiles.newId(), name: "", level: 1, color: PROFILE_COLORS[Profiles.all().length % PROFILE_COLORS.length], locked: false };
  return {
    tab: "profiles",
    render(el) {
      el.innerHTML = `<section class="page narrow">
        <h1>${existing ? "Edit profile" : "Add profile"}</h1>
        <div class="edit-grid">
          <div class="edit-pic">
            <div id="preview"></div>
            <label class="f btn" tabindex="0" id="photo-btn">Choose photo<input type="file" id="photo" accept="image/*" hidden></label>
            <button class="f btn" id="photo-remove" ${p.photo ? "" : "hidden"}>Remove photo</button>
          </div>
          <div class="edit-fields">
            <label class="field"><span>Name</span><input class="f" id="name" maxlength="20" value="${escapeHtml(p.name)}" placeholder="Name" autocomplete="off"></label>
            <div class="field"><span>Age group</span><div class="chips">${AGE_GROUPS.map((g) => `<button class="f chip-btn${g.level === p.level ? " on" : ""}" data-level="${g.level}">${g.name}</button>`).join("")}</div></div>
            <div class="field"><span>Color</span><div class="chips">${PROFILE_COLORS.map((c) => `<button class="f swatch${c === p.color ? " on" : ""}" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join("")}</div></div>
            <div class="field"><span>Safety filter</span><button class="f chip-btn toggle" id="safety"></button>
              <small class="hint-text">Hides very old cartoons and films with racist stereotypes or wartime propaganda.</small></div>
            <div class="field"><span>Parent PIN</span><button class="f chip-btn toggle${p.locked ? " on" : ""}" id="locked">${p.locked ? "Needs parent PIN to open" : "Opens without a PIN"}</button></div>
            <div class="btns">
              <button class="f btn gold" id="save">Save</button>
              <button class="f btn" id="cancel">Cancel</button>
              ${existing && Profiles.all().length > 1 ? `<button class="f btn danger" id="delete">Delete profile</button>` : ""}
            </div>
          </div>
        </div>
      </section>`;
      const preview = () => {
        const d = Profiles.get(p.id) ? { ...Profiles.get(p.id), ...p } : { ...p, letter: (p.name.trim()[0] || "?").toUpperCase() };
        d.letter = (p.name.trim()[0] || "?").toUpperCase();
        el.querySelector("#preview").innerHTML = Profiles.avatar(d, "pic big");
        el.querySelector("#photo-remove").hidden = !p.photo;
      };
      preview();
      const name = el.querySelector("#name");
      name.addEventListener("input", () => { p.name = name.value; preview(); });
      el.querySelectorAll("[data-level]").forEach((b) => b.addEventListener("click", () => {
        p.level = +b.dataset.level;
        if (p.level >= 2 && !existing) { p.locked = true; }
        el.querySelectorAll("[data-level]").forEach((x) => x.classList.toggle("on", x === b));
        syncLock();
      }));
      el.querySelectorAll("[data-color]").forEach((b) => b.addEventListener("click", () => {
        p.color = b.dataset.color;
        el.querySelectorAll("[data-color]").forEach((x) => x.classList.toggle("on", x === b));
        preview();
      }));
      const safetyBtn = el.querySelector("#safety");
      const syncSafety = () => {
        const on = Safety.filterOn(p);
        safetyBtn.classList.toggle("on", on);
        safetyBtn.textContent = on ? "On: hide stereotype and propaganda films" : "Off";
      };
      safetyBtn.addEventListener("click", () => { p.safety = !Safety.filterOn(p); syncSafety(); });
      syncSafety();
      const lockBtn = el.querySelector("#locked");
      function syncLock() {
        lockBtn.classList.toggle("on", !!p.locked);
        lockBtn.textContent = p.locked ? "Needs parent PIN to open" : "Opens without a PIN";
      }
      lockBtn.addEventListener("click", () => { p.locked = !p.locked; syncLock(); });
      const file = el.querySelector("#photo");
      file.addEventListener("change", async () => {
        if (!file.files[0]) return;
        try { p.photo = await photoToDataUrl(file.files[0]); preview(); } catch (_) { toast("That file isn't a picture"); }
      });
      el.querySelector("#photo-remove").addEventListener("click", () => { delete p.photo; preview(); });
      el.querySelector("#save").addEventListener("click", () => {
        p.name = name.value.trim();
        if (!p.name) { toast("Type a name first"); SpatialNav.focus(name); return; }
        try { Profiles.save(p); } catch (_) { toast("Couldn't save. Try a smaller photo."); return; }
        if (profile && profile.id === p.id) setProfile(Profiles.get(p.id));
        toast("Saved");
        back();
      });
      el.querySelector("#cancel").addEventListener("click", back);
      const del = el.querySelector("#delete");
      if (del) {
        let armed = false;
        del.addEventListener("click", () => {
          if (!armed) { armed = true; del.textContent = "Press again to delete"; return; }
          Profiles.remove(p.id);
          if (profile && profile.id === p.id) setProfile(null);
          toast("Profile deleted");
          back();
        });
      }
      SpatialNav.focus(existing ? el.querySelector("#save") : name);
    },
  };
}

function HiddenView() {
  return {
    tab: "profiles",
    render(el) {
      const draw = () => {
        const list = Library.hidden();
        el.querySelector("#hidden-list").innerHTML = list.length ? list.map((x) => `
          <div class="log-row"><span class="thumb" style="background-image:url('${Catalog.image(x.id)}')"></span>
            <span><b>${escapeHtml(x.title)}</b><small>Hidden ${new Date(x.at).toLocaleDateString()}</small></span>
            <button class="f btn small" data-unhide="${escapeHtml(x.id)}">Show again</button></div>`).join("")
          : `<div class="empty">No hidden movies. Use “Hide this movie” on any movie page.</div>`;
        el.querySelectorAll("[data-unhide]").forEach((b) => b.addEventListener("click", () => { Library.unhide(b.dataset.unhide); toast("It will show again"); draw(); }));
      };
      el.innerHTML = `<section class="page narrow"><h1>Hidden movies</h1>
        <p class="sub">These movies are hidden for every profile on this device (and on linked devices).</p>
        <div class="log" id="hidden-list"></div>
        <div class="btns"><button class="f btn" id="back">Back</button></div></section>`;
      el.querySelector("#back").addEventListener("click", back);
      draw();
      SpatialNav.focus(el.querySelector("[data-unhide]") || el.querySelector("#back"));
    },
  };
}

function SyncView() {
  let pairing = null, off = null;
  return {
    tab: "profiles",
    render(el) {
      const draw = () => {
        const list = Sync.linked();
        const n = Sync.connectedCount();
        el.innerHTML = `<section class="page narrow">
          <h1>Sync devices</h1>
          <p class="sub">Link the family's TV, phones, tablets and computers so profiles, the parent PIN, My List, Continue Watching, likes, hidden movies and watch history match on all of them. Linked devices sync whenever two of them have the app open.</p>
          <div class="sync-status"><b>This ${escapeHtml(Sync.deviceName().toLowerCase())}</b>
            <span>${list.length ? `${list.length} linked device${list.length === 1 ? "" : "s"} · ${n ? `${n} connected now` : "none open right now"}${Sync.lastSync() ? ` · synced ${new Date(Sync.lastSync()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}` : "Not linked yet"}</span></div>
          ${list.length ? `<div class="log">${list.map((d) => `<div class="log-row compact"><span><b>${escapeHtml(d.name)}</b><small>Last seen ${new Date(d.seen).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></span><span class="mins">${n ? "" : ""}</span></div>`).join("")}</div>` : ""}
          <div class="btns">
            <button class="f btn gold" id="show-code">Show a code on this device</button>
            <button class="f btn" id="enter-code">Enter a code from another device</button>
            ${list.length ? `<button class="f btn" id="unlink">Unlink this device</button>` : ""}
            <button class="f btn" id="back">Back</button>
          </div>
          <div id="pair-area"></div>
        </section>`;
        el.querySelector("#back").addEventListener("click", back);
        el.querySelector("#show-code").addEventListener("click", async () => {
          const area = el.querySelector("#pair-area");
          area.innerHTML = `<p class="sub">Getting a code…</p>`;
          try {
            pairing = await Sync.showCode((name) => { toast(`Linked with ${name || "the other device"}`); draw(); });
            area.innerHTML = `<p>On the other device, open <b>Manage profiles → Sync devices → Enter a code</b> and type:</p><div class="big-code">${pairing.code.replace(/(\d{3})(\d{3})/, "$1 $2")}</div>`;
          } catch (_) { area.innerHTML = `<p class="sub">Couldn't get a code. Check the internet connection and try again.</p>`; }
        });
        el.querySelector("#enter-code").addEventListener("click", () => {
          const area = el.querySelector("#pair-area");
          area.innerHTML = `<form id="pair-form" class="pair-form"><input class="code-input" id="pair-code" inputmode="numeric" maxlength="7" placeholder="123 456" autocomplete="off"><button class="f btn gold">Link</button></form><p class="sub" id="pair-msg"></p>`;
          const input = area.querySelector("#pair-code");
          input.focus();
          area.querySelector("#pair-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const code = input.value.replace(/\D/g, "");
            const msg = area.querySelector("#pair-msg");
            if (code.length !== 6) { msg.textContent = "Codes have 6 numbers."; return; }
            msg.textContent = "Linking…";
            try { const name = await Sync.enterCode(code); toast(`Linked with ${name || "the other device"}`); draw(); }
            catch (_) { msg.textContent = "Couldn't link. Check the code, and that the other device still shows it."; }
          });
        });
        const unlink = el.querySelector("#unlink");
        if (unlink) {
          let armed = false;
          unlink.addEventListener("click", () => {
            if (!armed) { armed = true; unlink.textContent = "Press again to unlink"; return; }
            Sync.unlinkAll(); toast("This device is no longer linked"); draw();
          });
        }
        SpatialNav.focus(el.querySelector("#show-code"));
      };
      off = Sync.onChange(() => { if (!pairing) draw(); });
      draw();
    },
    destroy() { if (pairing) pairing.cancel(); if (off) off(); },
  };
}

// Settings for this device: TV speed mode, cell data, data saver.
function SettingsView() {
  return {
    tab: "profiles",
    render(el) {
      const opt = (key, options) => options.map(([v, label]) => `<button class="f chip-btn${Settings.get(key) === v ? " on" : ""}" data-set="${key}" data-v="${v}">${label}</button>`).join("");
      el.innerHTML = `<section class="page narrow">
        <h1>Settings</h1>
        <p class="sub">These settings are for this device only.</p>
        <div class="field"><span>Speed mode</span><div class="chips">${opt("speed", [["auto", Settings.isTV ? "Automatic (on for this TV)" : "Automatic"], ["on", "On"], ["off", "Off"]])}</div>
          <small class="hint-text">Turns off blurred backgrounds, previews and animations so slower TVs and older devices stay smooth.</small></div>
        <div class="field"><span>Data saver</span><div class="chips">${opt("saver", [["off", "Off"], ["on", "Always on"]])}</div>
          <small class="hint-text">Plays smaller video files. Uses about a quarter of the data, with a softer picture.</small></div>
        <div class="field"><span>On cell data</span><div class="chips">${opt("cellData", [["ask", "Ask me"], ["saver", "Use data saver"], ["full", "Full quality"]])}</div>
          <small class="hint-text">${Settings.canDetectCell ? "This device can tell when it's on cell data." : "This browser can't tell Wi-Fi from cell data, so use Data saver above when you're out."}</small></div>
        <h2 class="section-title">Easier to see and read</h2>
        <div class="field"><span>Text size</span><div class="chips">${opt("text", [["m", "Normal"], ["l", "Large"], ["xl", "Extra large"]])}</div></div>
        <div class="field"><span>High contrast</span><div class="chips">${opt("contrast", [["off", "Off"], ["on", "On"]])}</div>
          <small class="hint-text">Brighter text, stronger outlines and plain backgrounds behind words.</small></div>
        <div class="field"><span>Subtitles</span><div class="chips">${opt("subs", [["off", "Off"], ["on", "On when available"]])}</div></div>
        <div class="btns"><button class="f btn" id="back">Back</button></div>
      </section>`;
      el.querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", () => {
        Settings.set(b.dataset.set, b.dataset.v);
        el.querySelectorAll(`[data-set="${b.dataset.set}"]`).forEach((x) => x.classList.toggle("on", x === b));
        toast("Saved");
      }));
      el.querySelector("#back").addEventListener("click", back);
      SpatialNav.focus(el.querySelector("[data-set]"));
    },
  };
}

function AboutView() {
  const OPEN_MOVIES = [
    ["Big Buck Bunny (2008)", "Blender Foundation", "CC BY 3.0", "https://creativecommons.org/licenses/by/3.0/"],
    ["Elephants Dream (2006)", "Orange Open Movie Project Studios / Blender Foundation", "CC BY 2.5", "https://creativecommons.org/licenses/by/2.5/"],
    ["Sintel (2010)", "Blender Foundation", "CC BY 3.0", "https://creativecommons.org/licenses/by/3.0/"],
    ["Tears of Steel (2012)", "Blender Foundation", "CC BY 3.0", "https://creativecommons.org/licenses/by/3.0/"],
    ["Caminandes (2013–2016)", "Blender Foundation / Pablo Vazquez", "CC BY", "https://creativecommons.org/licenses/by/4.0/"],
    ["Cosmos Laundromat (2015)", "Blender Institute", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"],
    ["Agent 327: Operation Barbershop (2017)", "Blender Animation Studio", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"],
    ["Coffee Run (2020)", "Blender Studio", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"],
    ["Sprite Fright (2021)", "Blender Studio", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"],
    ["Wing It! (2023)", "Blender Studio", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"],
  ];
  return {
    tab: "profiles",
    render(el) {
      el.innerHTML = `<section class="page narrow about">
        <h1>About &amp; credits</h1>
        <p>Every movie in this app is free and legal to watch. Classic films and cartoons are in the public domain or shared by their owners, and are streamed from the <a href="https://archive.org" target="_blank" rel="noopener">Internet Archive</a>, a non-profit library. Each movie page credits its maker and license when the Internet Archive lists one.</p>
        <h2 class="section-title">Open movies</h2>
        <p class="sub">These newer films are shared under Creative Commons licenses that ask for credit to their makers.</p>
        <ul class="credits">${OPEN_MOVIES.map(([t, by, lic, url]) => `<li><b>${t}</b> by ${by} · <a href="${url}" target="_blank" rel="noopener">${lic}</a></li>`).join("")}</ul>
        <p class="sub">More about these films at <a href="https://studio.blender.org/films/" target="_blank" rel="noopener">studio.blender.org/films</a>.</p>
        <h2 class="section-title">Made with</h2>
        <ul class="credits">
          <li>Fonts: Bricolage Grotesque and Figtree (SIL Open Font License), from Google Fonts</li>
          <li>PeerJS (MIT License) for the phone remote and device sync</li>
          <li>qrcode-generator by Kazuhiko Arase (MIT License) for QR codes</li>
          <li>Google Cast for Chromecast</li>
        </ul>
        <h2 class="section-title">Copyright and takedown requests</h2>
        <p>Only curated Internet Archive collections of public-domain and openly licensed films are used, and films made after ${COPYRIGHT_CUTOFF_YEAR} are only shown when they carry an open license. If you own the rights to a film shown here, use <b>Report a problem</b> on its page, or open an issue at <a href="https://github.com/gerald2020williams-afk/movie-app-games/issues" target="_blank" rel="noopener">the app's GitHub page</a>. Reported films are removed from the app. You can also contact the <a href="https://help.archive.org/help/rights/" target="_blank" rel="noopener">Internet Archive</a> directly.</p>
        <h2 class="section-title">Privacy</h2>
        <p>The app has no accounts and sends no personal data to us. Profiles, photos, My List, watch history and settings stay on your devices. Linked devices sync directly with each other. Movie searches go to the Internet Archive, and the phone remote and sync use the free PeerJS service only to connect your devices.</p>
        <div class="btns"><button class="f btn" id="back">Back</button></div>
      </section>`;
      el.querySelector("#back").addEventListener("click", back);
      SpatialNav.focus(el.querySelector("#back"));
    },
  };
}

function WatchHistoryView() {
  let pid = (Profiles.all()[0] || {}).id;
  return {
    tab: "profiles",
    render(el) {
      const people = Profiles.all();
      const draw = () => {
        const log = Library.history(pid);
        el.querySelector("#log").innerHTML = log.length ? log.map((x) => `
          <div class="log-row"><span class="thumb" style="background-image:url('${Catalog.image(x.id)}')"></span>
            <span><b>${escapeHtml(x.title)}</b><small>${new Date(x.at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></span>
            <span class="mins">${x.secs >= 60 ? Math.round(x.secs / 60) + " min" : "Under 1 min"}</span></div>`).join("")
          : `<div class="empty">Nothing watched yet on this profile.</div>`;
        el.querySelectorAll("[data-pid]").forEach((b) => b.classList.toggle("on", b.dataset.pid === pid));
      };
      el.innerHTML = `<section class="page narrow">
        <h1>Watch history</h1>
        <p class="sub">What each profile watched on this device, newest first.</p>
        <div class="chips">${people.map((p) => `<button class="f chip-btn" data-pid="${p.id}">${escapeHtml(p.name)}</button>`).join("")}</div>
        <div class="log" id="log"></div>
        <div class="btns"><button class="f btn" id="clear">Clear this profile's history</button><button class="f btn" id="back">Back</button></div>
      </section>`;
      el.querySelectorAll("[data-pid]").forEach((b) => b.addEventListener("click", () => { pid = b.dataset.pid; draw(); }));
      let armed = false;
      el.querySelector("#clear").addEventListener("click", (e) => {
        if (!armed) { armed = true; e.target.textContent = "Press again to clear"; return; }
        Library.clearHistory(pid); armed = false; e.target.textContent = "Clear this profile's history"; draw(); toast("History cleared");
      });
      el.querySelector("#back").addEventListener("click", back);
      draw();
      SpatialNav.focus(el.querySelector("[data-pid]"));
    },
  };
}
