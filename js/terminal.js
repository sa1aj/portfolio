/* Terminal mode + a small capture-the-flag.
 * Everything runs in the browser. The flag is stored only as a SHA-256 hash,
 * so reading the source shows you the puzzle, not the answer. */
(function () {
  "use strict";

  // ---------- Elements ----------
  var $ = function (id) { return document.getElementById(id); };
  var term = $("terminal"), out = $("term-out"), form = $("term-form"), input = $("term-in");
  var toggleBtn = $("term-toggle"), closeBtn = $("term-close"), hintBtn = $("hint");
  var themeBtn = $("theme-toggle");
  var year = $("year");
  if (year) year.textContent = new Date().getFullYear();

  // ---------- Content ----------
  var FLAG_SHA256 = "51871c11e94a4b6f1c2149697f1523c54a93f6f306909248f8a8151ab626da4b";

  var PROJECTS = {
    "photo-site": [
      "<span class='hl'>Secure Photography Site</span>",
      "Static photography site on Amazon S3, delivered through CloudFront.",
      "Amazon GuardDuty watches the account and raises alerts.",
      "<span class='dim'>stack:</span> S3 · CloudFront · GuardDuty",
      "<button class='link' data-goto='projects'>view on page →</button>"
    ],
    "knightro-tracker": [
      "<span class='hl'>Knightro Tracker</span>  <span class='dim'>(Knight Hacks IX)</span>",
      "Web app built by a team of 4 at Knight Hacks IX,",
      "running on an AWS serverless backend.",
      "<span class='dim'>stack:</span> AWS serverless",
      "<button class='link' data-goto='projects'>view on page →</button>"
    ]
  };

  var FILES = {
    "about.txt": [
      "CS junior @ University of Central Florida (transferred from USF).",
      "Focused on cloud security. Goal: Cloud Security Engineer.",
      "Photographer when I'm away from the keyboard."
    ],
    "skills.txt": [
      "<span class='hl'>languages</span>   Python, Java, C",
      "<span class='hl'>cloud/sec</span>   S3, CloudFront, GuardDuty, AWS serverless, Amplify",
      "<span class='hl'>web/tools</span>   HTML/CSS/JS, Git, GitHub"
    ],
    "contact.txt": [
      "github    <a href='https://github.com/sa1aj' target='_blank' rel='noopener'>github.com/sa1aj</a>",
      "linkedin  <a href='https://www.linkedin.com/in/salah-eddin-yacoub-8050b4325/' target='_blank' rel='noopener'>linkedin.com/in/salah-eddin-yacoub</a>",
      "email     <a href='mailto:salah1yacoub@gmail.com'>salah1yacoub@gmail.com</a>"
    ],
    ".notes": [
      "<span class='dim'># note to self</span>",
      "locked the flag up twice:",
      "  layer 1 (outside): base64",
      "  layer 2 (inside):  the thing Caesar would do, but 13 places",
      "tools are in `help`. submit with: submit flag{...}"
    ],
    ".flag.enc": ["c3ludHtmM3BoZTNfb2xfcTNzbmh5Z30="]
  };

  var VISIBLE = ["about.txt", "skills.txt", "contact.txt", "projects/"];
  var HIDDEN = [".notes", ".flag.enc"];

  var COMMANDS = {
    help: "show this help",
    whoami: "who is this?",
    ls: "list files  (try: ls projects)",
    cat: "print a file  (cat about.txt, cat projects/photo-site)",
    goto: "scroll the page  (goto about | skills | projects)",
    theme: "toggle light/dark",
    clear: "clear the screen",
    history: "show previous commands",
    exit: "close the terminal",
    base64: "base64 -d <text>  decode base64",
    rot13: "rot13 <text>  rotate letters by 13",
    submit: "submit flag{...}"
  };

  // ---------- Output helpers ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // `html` must be trusted (static strings above or escaped input).
  function printHTML(html, cls) {
    var p = document.createElement("p");
    p.className = "line" + (cls ? " " + cls : "");
    p.innerHTML = html;
    out.appendChild(p);
  }
  function print(text, cls) { printHTML(esc(text), cls); }
  function printLines(lines) { lines.forEach(function (l) { printHTML(l); }); }
  function scrollOut() { out.scrollTop = out.scrollHeight; }

  // ---------- Commands ----------
  function resolveFile(arg) {
    if (!arg) return null;
    var a = arg.replace(/^\.\//, "").replace(/^~\//, "");
    if (FILES[a]) return FILES[a];
    var name = a.replace(/^projects\//, "");
    if (PROJECTS[name]) return PROJECTS[name];
    return null;
  }

  var handlers = {
    help: function () {
      print("available commands:", "hl");
      Object.keys(COMMANDS).forEach(function (k) {
        printHTML("  <span class='hl'>" + (k + "          ").slice(0, 10) + "</span>" + esc(COMMANDS[k]));
      });
      print("");
      print("hint: not every file shows up in a plain `ls`...", "dim");
    },
    whoami: function () {
      printLines([
        "<span class='hl'>Salah Yacoub</span>",
        "CS junior @ UCF · cloud security · aspiring Cloud Security Engineer",
        "languages: Python, Java, C · also: photography"
      ]);
    },
    ls: function (args) {
      var flags = args.filter(function (a) { return a[0] === "-"; });
      var paths = args.filter(function (a) { return a[0] !== "-"; });
      var all = flags.some(function (f) { return f.indexOf("a") !== -1; });
      var target = (paths[0] || "").replace(/\/$/, "");
      if (target === "projects") {
        printHTML(Object.keys(PROJECTS).map(function (p) { return "<span class='hl'>" + p + "</span>"; }).join("   "));
        return;
      }
      if (target && target !== "." && target !== "~") {
        print("ls: cannot access '" + target + "': No such file or directory", "err");
        return;
      }
      var list = (all ? [".", ".."].concat(HIDDEN) : []).concat(VISIBLE);
      printHTML(list.map(function (f) {
        return f.slice(-1) === "/" ? "<span class='hl'>" + f + "</span>" : esc(f);
      }).join("   "));
      if (all) solved || print("👀 interesting...", "dim");
    },
    cat: function (args) {
      if (!args[0]) { print("usage: cat <file>", "err"); return; }
      if (args[0].replace(/\/$/, "") === "projects") { print("cat: projects: Is a directory", "err"); return; }
      var f = resolveFile(args[0]);
      if (!f) { print("cat: " + args[0] + ": No such file or directory", "err"); return; }
      printLines(f);
    },
    goto: function (args) {
      var id = (args[0] || "").toLowerCase();
      var el = ["about", "skills", "projects", "top"].indexOf(id) !== -1 && document.getElementById(id);
      if (!el) { print("usage: goto about | skills | projects", "err"); return; }
      gotoSection(id);
      print("→ scrolled to " + id, "ok");
    },
    theme: function () { toggleTheme(); print("theme: " + currentTheme(), "ok"); },
    clear: function () { out.innerHTML = ""; },
    history: function () { history.forEach(function (h, i) { print("  " + (i + 1) + "  " + h); }); },
    exit: function () { closeTerm(); },
    base64: function (args) {
      var text = args.filter(function (a) { return a !== "-d" && a !== "--decode"; }).join(" ");
      if (!text) { print("usage: base64 -d <text>", "err"); return; }
      if (args.indexOf("-d") === -1 && args.indexOf("--decode") === -1) {
        try { print(btoa(unescape(encodeURIComponent(text)))); } catch (e) { print("base64: invalid input", "err"); }
        return;
      }
      try { print(decodeURIComponent(escape(atob(text.trim())))); }
      catch (e) { print("base64: invalid input", "err"); }
    },
    rot13: function (args) {
      var text = args.join(" ");
      if (!text) { print("usage: rot13 <text>", "err"); return; }
      print(text.replace(/[a-z]/gi, function (c) {
        var b = c <= "Z" ? 65 : 97;
        return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b);
      }));
    },
    submit: function (args) {
      var guess = args.join(" ").trim();
      if (!guess) { print("usage: submit flag{...}", "err"); return; }
      sha256(guess).then(function (h) {
        if (h === null) { print("submit: needs a secure context (https or localhost)", "err"); }
        else if (h === FLAG_SHA256) { win(); }
        else { print("✗ not quite. check `cat .notes` for the recipe.", "err"); }
        scrollOut();
      });
    },
    // easter eggs
    sudo: function () { print("guest is not in the sudoers file. This incident will be reported. 🙂", "err"); },
    pwd: function () { print("/home/guest"); },
    echo: function (args) { print(args.join(" ")); },
    cd: function (args) {
      if ((args[0] || "").replace(/\/$/, "") === "projects") print("tip: try `ls projects` or `cat projects/photo-site`", "dim");
    }
  };
  var ALIASES = { "?": "help", man: "help", quit: "exit", q: "exit", cls: "clear", open: "goto", projects: "ls projects", about: "cat about.txt", skills: "cat skills.txt" };

  var solved = false;
  function win() {
    solved = true;
    printLines([
      "<span class='ok'>✓ flag accepted. nice work.</span>",
      "<span class='ok'>  ┌─────────────────────────────┐</span>",
      "<span class='ok'>  │  secure by default. always. │</span>",
      "<span class='ok'>  └─────────────────────────────┘</span>",
      "<span class='dim'>you found it. now you know how I think. let's talk: </span><span class='hl'>cat contact.txt</span>"
    ]);
    try { localStorage.setItem("ctf_solved", "1"); } catch (e) {}
  }

  function sha256(str) {
    if (!(window.crypto && crypto.subtle)) return Promise.resolve(null);
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    });
  }

  // ---------- Run ----------
  var history = [], hIndex = 0;

  function run(raw) {
    var line = raw.trim();
    printHTML("<span class='cmd'><b>guest@salah.sec:~$</b> " + esc(line) + "</span>");
    if (line) { history.push(line); }
    hIndex = history.length;
    if (!line) { scrollOut(); return; }

    var first = line.split(/\s+/)[0];
    var alias = Object.prototype.hasOwnProperty.call(ALIASES, first.toLowerCase()) && ALIASES[first.toLowerCase()];
    if (alias) line = alias + line.slice(first.length);
    var parts = line.split(/\s+/);
    var cmd = parts[0].toLowerCase();
    var fn = Object.prototype.hasOwnProperty.call(handlers, cmd) ? handlers[cmd] : null;
    if (fn) fn(parts.slice(1));
    else print(cmd + ": command not found. type `help`.", "err");
    scrollOut();
  }

  // ---------- Tab completion ----------
  function complete() {
    var val = input.value;
    var parts = val.split(/\s+/);
    var cands;
    if (parts.length <= 1) {
      cands = Object.keys(COMMANDS).filter(function (c) { return c.indexOf(parts[0]) === 0; });
      if (cands.length === 1) { input.value = cands[0] + " "; return; }
    } else {
      var last = parts[parts.length - 1];
      var pool = Object.keys(FILES).concat(Object.keys(PROJECTS).map(function (p) { return "projects/" + p; }), ["projects/", "about", "skills"]);
      cands = pool.filter(function (f) { return f.indexOf(last) === 0 && (last[0] === "." || f[0] !== "."); });
      if (cands.length === 1) { parts[parts.length - 1] = cands[0]; input.value = parts.join(" "); return; }
    }
    if (cands && cands.length > 1) { print(cands.join("   "), "dim"); scrollOut(); }
  }

  // ---------- Open / close ----------
  var booted = false, lastFocus = null;

  function openTerm() {
    if (!term.hidden) { input.focus(); return; }
    lastFocus = document.activeElement;
    term.hidden = false;
    // next frame so the slide-in transition runs
    requestAnimationFrame(function () { term.classList.add("is-open"); });
    document.body.classList.add("term-open");
    toggleBtn.setAttribute("aria-expanded", "true");
    if (!booted) {
      booted = true;
      printLines([
        "<span class='hl'>salah.sec terminal</span> <span class='dim'>v1.0 · type</span> <span class='hl'>help</span> <span class='dim'>to begin</span>",
        "<span class='dim'>a flag is hidden somewhere in here. good luck.</span>"
      ]);
      try { if (localStorage.getItem("ctf_solved")) print("(welcome back, flag-finder ✓)", "ok"); } catch (e) {}
    }
    // Don't pop the mobile keyboard automatically; users can tap chips first.
    if (window.matchMedia("(hover: hover)").matches) input.focus();
  }

  function closeTerm() {
    term.classList.remove("is-open");
    document.body.classList.remove("term-open");
    toggleBtn.setAttribute("aria-expanded", "false");
    var done = function () { term.hidden = true; };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) done();
    else setTimeout(done, 250);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function gotoSection(id) {
    var el = document.getElementById(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }

  // ---------- Theme ----------
  function currentTheme() {
    var t = document.documentElement.dataset.theme;
    if (t) return t;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  function toggleTheme() {
    var next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    var meta = document.querySelector('meta[name="theme-color"]');   // iOS status bar colour
    if (meta) meta.content = next === "light" ? "#f3f1ec" : "#070707";
    try { localStorage.setItem("theme", next); } catch (e) {}
  }

  // ---------- Events ----------
  toggleBtn.addEventListener("click", function () { term.hidden ? openTerm() : closeTerm(); });
  hintBtn.addEventListener("click", openTerm);
  closeBtn.addEventListener("click", closeTerm);
  themeBtn.addEventListener("click", toggleTheme);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = input.value;
    input.value = "";
    run(v);
  });

  term.querySelector(".terminal__chips").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-cmd]");
    if (b) run(b.dataset.cmd);
  });

  out.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-goto]");
    if (b) gotoSection(b.dataset.goto);
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowUp") {
      if (hIndex > 0) { hIndex--; input.value = history[hIndex]; }
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      if (hIndex < history.length - 1) { hIndex++; input.value = history[hIndex]; }
      else { hIndex = history.length; input.value = ""; }
      e.preventDefault();
    } else if (e.key === "Tab") {
      e.preventDefault();
      complete();
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      out.innerHTML = "";
    }
  });

  document.addEventListener("keydown", function (e) {
    var t = e.target;
    var typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    if (e.key === "`" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      term.hidden ? openTerm() : closeTerm();
    } else if (e.key === "Escape" && !term.hidden) {
      closeTerm();
    }
  });
})();
