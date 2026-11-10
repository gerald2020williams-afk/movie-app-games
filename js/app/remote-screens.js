// Phone-as-remote screens (TV side and phone side).

// TV side: show a code so a phone can become the remote.
function RemoteHostView() {
  return {
    tab: current ? current.tab : "home",
    render(el) {
      el.innerHTML = `<section class="remote-host">
        <h1>Use your phone as the remote</h1>
        <div class="remote-host-grid">
          <div class="qr" id="qr"><div class="empty">Getting a code…</div></div>
          <div class="steps">
            <p><b>1.</b> On your phone, scan the code with the camera, or open this app and pick <b>Use this phone as a remote</b>.</p>
            <p><b>2.</b> Enter this code:</p>
            <div class="big-code" id="code">······</div>
            <p class="sub" id="remote-status">Waiting for a phone…</p>
            <div class="btns"><button class="f btn gold" id="done">Done</button></div>
          </div>
        </div>
      </section>`;
      el.querySelector("#done").addEventListener("click", back);
      SpatialNav.focus(el.querySelector("#done"));
      startRemoteHost().then(async (h) => {
        if (!el.isConnected) return;
        el.querySelector("#code").textContent = h.code.replace(/(\d{3})(\d{3})/, "$1 $2");
        const svg = await Remote.qrSvg(Remote.linkFor(h.code));
        el.querySelector("#qr").innerHTML = svg || `<div class="empty">${escapeHtml(Remote.linkFor(h.code))}</div>`;
        if (h.conns.size) el.querySelector("#remote-status").textContent = "Phone connected";
      }).catch(() => {
        if (el.isConnected) el.querySelector("#remote-status").textContent = "Couldn't start the phone remote. Check the internet connection and try again.";
      });
    },
  };
}

function startRemoteHost() {
  return Remote.startHost({
    onAction: (a) => { document.body.classList.remove("mouse"); Input.press(a); },
    onText: (text) => {
      if (current && current.tab === "search" && view.querySelector("#q")) {
        const q = view.querySelector("#q"); q.value = text; q.dispatchEvent(new Event("input"));
      } else { openTab("search"); const q = view.querySelector("#q"); if (q) { q.value = text; q.dispatchEvent(new Event("input")); } }
    },
    onChange: (n) => {
      toast(n ? "Phone remote connected" : "Phone remote disconnected");
      const st = document.getElementById("remote-status");
      if (st) st.textContent = n ? "Phone connected. You can close this." : "Waiting for a phone…";
      document.getElementById("remote-btn").classList.toggle("on", n > 0);
    },
  });
}

// Phone side: a remote control for the TV.
function PhoneRemoteView(code = "") {
  let link = null;
  return {
    tab: "profiles",
    render(el) {
      const pad = () => {
        document.body.classList.add("remote-mode");
        el.innerHTML = `<section class="phone-remote">
          <div class="pr-top"><b>Remote</b><span id="pr-status">Connected to TV</span></div>
          <div class="dpad">
            <button class="pr up" data-a="up" aria-label="Up">▲</button>
            <button class="pr left" data-a="left" aria-label="Left">◀</button>
            <button class="pr ok" data-a="ok">OK</button>
            <button class="pr right" data-a="right" aria-label="Right">▶</button>
            <button class="pr down" data-a="down" aria-label="Down">▼</button>
          </div>
          <div class="pr-row">
            <button class="pr wide" data-a="back">Back</button>
            <button class="pr wide" data-a="home">Home</button>
          </div>
          <form class="pr-search" id="pr-search"><input id="pr-text" placeholder="Search the TV for a movie" autocomplete="off"><button class="pr wide">Search</button></form>
          <button class="btn" id="pr-leave">Stop using as remote</button>
        </section>`;
        el.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => {
          link && link.send(b.dataset.a);
          if (navigator.vibrate) navigator.vibrate(12);
        }));
        el.querySelector("#pr-search").addEventListener("submit", (e) => {
          e.preventDefault();
          const v = el.querySelector("#pr-text").value.trim();
          if (v && link) { link.text(v); toast("Sent to the TV"); }
        });
        el.querySelector("#pr-leave").addEventListener("click", () => { if (link) link.close(); link = null; history.replaceState(null, "", location.pathname); openTab(profile ? "home" : "profiles"); });
      };
      const ask = (msg = "") => {
        el.innerHTML = `<section class="pin">
          <h1>Connect to your TV</h1>
          <p class="sub">On the TV, open the app and pick <b>Phone remote</b> at the top. Type the code it shows.</p>
          <form id="join"><input class="code-input" id="code" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" placeholder="123 456" value="${escapeHtml(code)}" autocomplete="off"><div class="btns center"><button class="f btn gold">Connect</button></div></form>
          <p class="sub" id="join-msg">${escapeHtml(msg)}</p>
        </section>`;
        el.querySelector("#join").addEventListener("submit", (e) => { e.preventDefault(); connect(el.querySelector("#code").value.replace(/\D/g, "")); });
        el.querySelector("#code").focus();
      };
      const connect = (c) => {
        if (c.length !== 6) { ask("Codes have 6 numbers."); return; }
        el.querySelector("#join-msg") && (el.querySelector("#join-msg").textContent = "Connecting…");
        Remote.join(c, { onClose: () => { link = null; const st = el.querySelector("#pr-status"); if (st) st.textContent = "Disconnected. Reopen the code on the TV."; } })
          .then((l) => { link = l; if (el.isConnected) pad(); })
          .catch(() => ask("Couldn't connect. Check the code, and that the TV still shows it."));
      };
      if (code) { ask(); connect(code.replace(/\D/g, "")); } else ask();
    },
    destroy() { if (link) link.close(); document.body.classList.remove("remote-mode"); },
  };
}
