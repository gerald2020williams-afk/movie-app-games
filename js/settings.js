// Settings for this device only (not synced): TV speed mode and cell-data video quality.

const Settings = (() => {
  const DEFAULTS = { speed: "auto", cellData: "ask", saver: "off", text: "m", contrast: "off", subs: "off" };
  const get = (k) => { try { return localStorage.getItem("set:" + k) || DEFAULTS[k]; } catch (_) { return DEFAULTS[k]; } };
  const set = (k, v) => { try { localStorage.setItem("set:" + k, v); } catch (_) {} apply(); };

  // Smart TVs, streaming sticks and low-power devices.
  const isTV = /SmartTV|SMART-TV|Tizen|Web0S|WebOS|NetCast|BRAVIA|AFT[A-Z]|Android TV|GoogleTV|CrKey|HbbTV|Roku|Viera|VIDAA|Hisense|Philips|TV Safari|PlayStation|Xbox/i.test(navigator.userAgent);
  const lowPower = (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);

  function speedMode() {
    const v = get("speed");
    return v === "on" || (v === "auto" && (isTV || lowPower));
  }

  // On cell data or a slow connection? (Android Chrome can tell; iPhones can't, so they use the manual switch.)
  function onCellData() {
    const c = navigator.connection;
    if (!c) return false;
    return c.type === "cellular" || c.saveData === true || ["slow-2g", "2g", "3g"].includes(c.effectiveType);
  }

  function apply() {
    document.documentElement.classList.toggle("lite", speedMode());
    document.documentElement.classList.toggle("tv", isTV);
    document.documentElement.dataset.text = get("text");
    document.documentElement.classList.toggle("contrast", get("contrast") === "on");
  }

  apply();
  return { get, set, isTV, speedMode, onCellData, canDetectCell: !!(navigator.connection && "type" in navigator.connection) };
})();
