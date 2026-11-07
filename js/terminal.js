/* Terminal mode + a three-stage capture-the-flag (home page).
 *
 * The CTF is a small incident to work through, built on my real projects:
 *   1 detect   find the rule-breaking sign-in in a CloudTrail log
 *   2 contain  find the statement that breaks least privilege in an IAM policy
 *   3 recover  decode a payload that was left behind (base64, then ROT13)
 * `answer <n> <text>` checks a stage. A correct answer unlocks one piece of the
 * flag; then `submit flag{piece1_piece2_piece3}`.
 *
 * What's in this file: the puzzle (log, policy, encoded payload), SHA-256
 * hashes of the answers and of the flag, and each piece XOR-encrypted with a
 * key derived from that stage's answer. So the source shows the puzzle, but
 * the flag never appears in it as readable text.
 */
(function () {
  "use strict";

  // ---------- Elements ----------
  var $ = function (id) { return document.getElementById(id); };
  var term = $("terminal"), out = $("term-out"), form = $("term-form"), input = $("term-in");
  var promptEl = term.querySelector(".terminal__prompt");
  var toggleBtn = $("term-toggle"), closeBtn = $("term-close"), hintBtn = $("hint");
  var themeBtn = $("theme-toggle");
  var year = $("year");
  if (year) year.textContent = new Date().getFullYear();
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  // ---------- CTF data ----------
  var FLAG_SHA256 = "51871c11e94a4b6f1c2149697f1523c54a93f6f306909248f8a8151ab626da4b";
  // check = sha256("check:" + answer); piece = XOR(piece, sha256("frag:" + answer))
  var STAGES = {
    1: { check: "0c3f8e0b1d2a6f818d5710d243863056905dfd87c2ee332944c9c675dba0f787", piece: "e7831585fde0",
         won: "that's the one. (true story: GuardDuty flagged root use on my own account, so all my routine work moved to an MFA-protected IAM user.)" },
    2: { check: "9083d8988fdb1ed153671c3cf29a92176a3fbf137cdb80302837e69cedb803cd", piece: "cc42",
         won: "right. an Allow with \"*\" for both Action and Resource is admin in disguise. my real bucket policy is scoped to one ARN, no wildcards." },
    3: { check: "305e9fb19c265de6c29aa5fd2f8802386add77d8f0c99970e43478e09b3e96af", piece: "56208d38774958",
         won: "decoded. layered encoding isn't encryption, which is why real secrets belong in KMS." }
  };
  var HINTS = {
    1: ["look for a ConsoleLogin with mfa=no.",
        "it isn't an IAM user at all. it's the account's most powerful sign-in. answer with its identity."],
    2: ["least privilege means only the actions and resources a job needs.",
        "a Deny can't over-grant. find the Allow with \"*\" in both Action and Resource, and answer with its Sid."],
    3: ["the outer layer is base64. try:  base64 -d <text>",
        "the inner layer is ROT13. try:  rot13 <text>. answer with the word you get."]
  };

  // ---------- Files ----------
  // Lines are trusted HTML (written here) unless a file is marked text: true,
  // in which case they're escaped and shown as-is.
  var h = function (s) { return "<span class='hl'>" + s + "</span>"; };
  var d = function (s) { return "<span class='dim'>" + s + "</span>"; };
  var link = function (href, label) { return "<a href='" + href + "'>" + label + " →</a>"; };

  var FS = {
    "~": { dir: true, items: ["about.txt", "skills.txt", "contact.txt", "projects/"], hidden: [".incident/"] },
    "~/about.txt": { lines: [
      "CS junior @ University of Central Florida · graduating Fall 2028.",
      "Focused on cloud security. Goal: Cloud Security Engineer.",
      "Studying for the AWS Certified Cloud Practitioner exam.",
      "Photographer when I'm away from the keyboard  " + d("(goto lens)")
    ] },
    "~/skills.txt": { lines: [
      h("languages") + "   Java, C, Python",
      h("cloud") + "       S3, CloudFront, IAM, KMS, CloudTrail, GuardDuty,",
      "            EventBridge, SNS, Lambda, API Gateway, DynamoDB, Amplify",
      h("tools") + "       Git, GitHub, Linux, AWS CLI, Claude Code",
      h("studying") + "    AWS Certified Cloud Practitioner"
    ] },
    "~/contact.txt": { lines: [
      "email     <a href='mailto:salah1yacoub@gmail.com'>salah1yacoub@gmail.com</a>",
      "github    <a href='https://github.com/sa1aj' target='_blank' rel='noopener'>github.com/sa1aj</a>",
      "linkedin  <a href='https://www.linkedin.com/in/salah-eddin-yacoub-8050b4325/' target='_blank' rel='noopener'>linkedin.com/in/salah-eddin-yacoub</a>",
      "resume    <a href='assets/resume.pdf' download>resume.pdf</a>"
    ] },
    "~/projects": { dir: true, items: ["photo-site", "knightro-tracker", "this-portfolio"] },
    "~/projects/photo-site": { lines: [
      h("Secure Photography Site") + "  " + d("Sep 2026"),
      "Private S3 bucket, reachable only through CloudFront (Origin Access",
      "Control, HTTPS only). Least-privilege IAM policy scoped to the bucket",
      "ARN, no wildcards. CloudTrail logs encrypted with a customer-managed",
      "KMS key, with log file validation. GuardDuty → EventBridge → SNS emails",
      "me Medium and High severity findings.",
      d("stack: S3 · CloudFront · IAM · CloudTrail · KMS · GuardDuty · EventBridge · SNS"),
      link("s3-site.html", "open the project page")
    ] },
    "~/projects/knightro-tracker": { lines: [
      h("Knightro Tracker") + "  " + d("Knight Hacks IX · Oct 2026"),
      "A live map of Knightro sightings across UCF, built by a team of four.",
      "I built the original serverless backend: two Lambda functions behind an",
      "API Gateway HTTP API. One validates and saves sightings to DynamoDB, the",
      "other returns only the last 20 minutes. CORS on the API, DynamoDB",
      "on-demand. The team later moved to Supabase for accounts and photo checks.",
      d("stack: API Gateway · Lambda · DynamoDB"),
      link("knightro.html", "open the project page")
    ] },
    "~/projects/this-portfolio": { lines: [
      h("This Portfolio") + "  " + d("Nov 2026"),
      "Plain HTML, CSS and JavaScript on AWS Amplify Hosting, deployed",
      "automatically from GitHub. Built with Claude Code through a dedicated,",
      "MFA-protected IAM user, never root. You're inside its terminal.",
      d("stack: Amplify · IAM · GitHub · Claude Code"),
      link("portfolio.html", "open the project page")
    ] },
    "~/.incident": { dir: true, items: ["README.txt", "cloudtrail.log", "policy.json", "payload.enc"] },
    "~/.incident/README.txt": { lines: [
      h("INCIDENT 0914") + "  " + d("photo-site account · inspired by a real GuardDuty finding"),
      "Work it like a real incident:",
      "",
      "  " + h("1  detect ") + "  cloudtrail.log   one sign-in broke the rules. which identity?",
      "  " + h("2  contain") + "  policy.json      one statement breaks least privilege. its Sid?",
      "  " + h("3  recover") + "  payload.enc      something was left behind, wrapped twice. what is it?",
      "",
      "check an answer:   " + h("answer &lt;stage&gt; &lt;text&gt;") + "     stuck?  " + h("hint &lt;stage&gt;"),
      "each correct answer unlocks a piece of the flag.  " + h("status") + " shows your progress.",
      "then:  " + h("submit flag{piece1_piece2_piece3}")
    ] },
    "~/.incident/cloudtrail.log": { text: true, lines: [
      "# management events · us-east-1 · simplified",
      "[1] 2026-09-12 14:03:22 UTC  ConsoleLogin",
      "    identity=IAMUser/salah-admin  mfa=yes  ip=198.51.100.24  result=Success",
      "[2] 2026-09-12 14:05:47 UTC  PutBucketPolicy",
      "    identity=IAMUser/salah-admin  mfa=yes  ip=198.51.100.24  result=Success",
      "[3] 2026-09-12 14:11:09 UTC  CreateTrail",
      "    identity=IAMUser/salah-admin  mfa=yes  ip=198.51.100.24  result=Success",
      "[4] 2026-09-13 22:40:15 UTC  ConsoleLogin",
      "    identity=IAMUser/salah-admin  mfa=yes  ip=198.51.100.24  result=Failure",
      "[5] 2026-09-14 03:47:52 UTC  ConsoleLogin",
      "    identity=Root  mfa=no  ip=203.0.113.66  result=Success",
      "[6] 2026-09-14 03:49:30 UTC  ListBuckets",
      "    identity=Root  mfa=no  ip=203.0.113.66  result=Success",
      "[7] 2026-09-14 09:15:02 UTC  GetBucketPolicy",
      "    identity=IAMUser/salah-admin  mfa=yes  ip=198.51.100.24  result=Success"
    ] },
    "~/.incident/policy.json": { text: true, lines: [
      "{",
      "  \"Version\": \"2012-10-17\",",
      "  \"Statement\": [",
      "    { \"Sid\": \"ReadSiteFiles\", \"Effect\": \"Allow\",",
      "      \"Action\": \"s3:GetObject\",",
      "      \"Resource\": \"arn:aws:s3:::photo-site-bucket/*\" },",
      "    { \"Sid\": \"ListSiteBucket\", \"Effect\": \"Allow\",",
      "      \"Action\": \"s3:ListBucket\",",
      "      \"Resource\": \"arn:aws:s3:::photo-site-bucket\" },",
      "    { \"Sid\": \"TempDebugAccess\", \"Effect\": \"Allow\",",
      "      \"Action\": \"*\",",
      "      \"Resource\": \"*\" },",
      "    { \"Sid\": \"DenyInsecureTransport\", \"Effect\": \"Deny\",",
      "      \"Action\": \"s3:*\",",
      "      \"Resource\": \"arn:aws:s3:::photo-site-bucket/*\",",
      "      \"Condition\": { \"Bool\": { \"aws:SecureTransport\": \"false\" } } }",
      "  ]",
      "}"
    ] },
    "~/.incident/payload.enc": { text: true, lines: ["cTNzbmh5Zw=="] }
  };

  var COMMANDS = {
    help: "show this help",
    whoami: "who is this?",
    ls: "list files  (ls -a shows hidden ones)",
    cd: "change directory  (cd projects, cd ..)",
    cat: "print a file  (cat about.txt)",
    goto: "scroll the page  (goto work | about | lens | skills | contact)",
    theme: "toggle light/dark",
    clear: "clear the screen",
    history: "show previous commands",
    exit: "close the terminal",
    base64: "base64 -d <text>  decode base64",
    rot13: "rot13 <text>  rotate letters by 13",
    answer: "answer <stage> <text>  check a CTF stage",
    hint: "hint <stage>  a nudge, if you're stuck",
    status: "CTF progress",
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

  // ---------- Paths ----------
  var cwd = "~";
  function resolve(arg) {
    var a = (arg || "").trim();
    if (!a || a === "~" || a === "/home/guest") return "~";
    a = a.replace(/^\/home\/guest\/?/, "~/").replace(/\/+$/, "");
    var parts = a.indexOf("~") === 0 ? a.split("/") : cwd.split("/").concat(a.split("/"));
    var stack = [];
    parts.forEach(function (p) {
      if (!p || p === ".") return;
      if (p === "..") { if (stack.length > 1) stack.pop(); return; }
      stack.push(p);
    });
    return stack.join("/") || "~";
  }
  function setPrompt() { promptEl.textContent = "guest@salah.sec:" + cwd + "$"; }

  // ---------- CTF state ----------
  var pieces = {};
  try { pieces = JSON.parse(localStorage.getItem("ctf_pieces") || "{}") || {}; } catch (e) { pieces = {}; }
  var hintStep = { 1: 0, 2: 0, 3: 0 };
  var solved = false;
  try { solved = !!localStorage.getItem("ctf_solved"); } catch (e) {}

  function sha256bytes(str) {
    if (!(window.crypto && crypto.subtle)) return Promise.resolve(null);
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)).then(function (b) { return new Uint8Array(b); });
  }
  function hex(bytes) { return Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, "0"); }).join(""); }
  function unhex(s) { var a = []; for (var i = 0; i < s.length; i += 2) a.push(parseInt(s.substr(i, 2), 16)); return a; }
  function normalize(s) { return s.toLowerCase().replace(/["'`]/g, "").replace(/\s+/g, " ").trim(); }

  // ---------- Commands ----------
  var handlers = {
    help: function () {
      print("available commands:", "hl");
      Object.keys(COMMANDS).forEach(function (k) {
        printHTML("  " + h((k + "          ").slice(0, 10)) + esc(COMMANDS[k]));
      });
      print("");
      print("hint: not everything shows up in a plain `ls`...", "dim");
    },
    whoami: function () {
      printLines([
        h("Salah Yacoub"),
        "CS junior @ UCF · cloud security · Orlando, FL",
        "languages: Java, C, Python · speaks English, Arabic"
      ]);
    },
    pwd: function () { print(cwd.replace(/^~/, "/home/guest")); },
    ls: function (args) {
      var flags = args.filter(function (a) { return a[0] === "-"; });
      var paths = args.filter(function (a) { return a[0] !== "-"; });
      var all = flags.some(function (f) { return f.indexOf("a") !== -1; });
      var path = resolve(paths[0] || ".");
      var node = FS[path];
      if (!node) { print("ls: cannot access '" + paths[0] + "': No such file or directory", "err"); return; }
      if (!node.dir) { print(paths[0]); return; }
      var list = (all ? [".", ".."].concat(node.hidden || []) : []).concat(node.items);
      printHTML(list.map(function (f) { return f.slice(-1) === "/" ? h(esc(f)) : esc(f); }).join("   "));
      if (all && path === "~" && !solved) print("👀 an incident folder. start with its README.", "dim");
    },
    cd: function (args) {
      var path = resolve(args[0] || "~");
      var node = FS[path];
      if (!node) { print("cd: " + args[0] + ": No such file or directory", "err"); return; }
      if (!node.dir) { print("cd: " + args[0] + ": Not a directory", "err"); return; }
      cwd = path; setPrompt();
    },
    cat: function (args) {
      if (!args[0]) { print("usage: cat <file>", "err"); return; }
      var node = FS[resolve(args[0])];
      if (!node) { print("cat: " + args[0] + ": No such file or directory", "err"); return; }
      if (node.dir) { print("cat: " + args[0] + ": Is a directory", "err"); return; }
      if (node.text) node.lines.forEach(function (l) { print(l); }); else printLines(node.lines);
    },
    goto: function (args) {
      var id = (args[0] || "").toLowerCase();
      if (id === "work") id = "projects";
      if (["about", "skills", "projects", "lens", "contact", "top"].indexOf(id) === -1) { print("usage: goto work | about | lens | skills | contact | top", "err"); return; }
      if (!document.getElementById(id)) { location.href = "index.html#" + id; return; }   // project pages: go home
      gotoSection(id);
      print("→ scrolled to " + (id === "projects" ? "work" : id), "ok");
    },
    theme: function () { toggleTheme(); print("theme: " + currentTheme(), "ok"); },
    clear: function () { out.innerHTML = ""; },
    history: function () { history.forEach(function (x, i) { print("  " + (i + 1) + "  " + x); }); },
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
    hint: function (args) {
      var n = parseInt(args[0], 10);
      if (!HINTS[n]) { print("usage: hint <stage>   (stages 1, 2, 3; the README is in ~/.incident)", "err"); return; }
      var i = Math.min(hintStep[n], HINTS[n].length - 1);
      print("hint " + n + "." + (i + 1) + ": " + HINTS[n][i], "dim");
      if (hintStep[n] < HINTS[n].length - 1) hintStep[n]++;
    },
    answer: function (args) {
      var n = parseInt(args[0], 10), guess = normalize(args.slice(1).join(" "));
      if (!STAGES[n] || !guess) { print("usage: answer <stage> <text>   e.g. answer 1 something", "err"); return; }
      return sha256bytes("check:" + guess).then(function (c) {
        if (c === null) { print("answer: needs a secure context (https or localhost)", "err"); return; }
        if (hex(c) !== STAGES[n].check) { print("✗ not that. try `hint " + n + "`.", "err"); return; }
        return sha256bytes("frag:" + guess).then(function (key) {
          var piece = new TextDecoder().decode(new Uint8Array(unhex(STAGES[n].piece).map(function (b, i) { return b ^ key[i]; })));
          pieces[n] = piece;
          try { localStorage.setItem("ctf_pieces", JSON.stringify(pieces)); } catch (e) {}
          printHTML("<span class='ok'>✓ stage " + n + " cleared.</span>  piece " + n + ": " + h(esc(piece)));
          print(STAGES[n].won, "dim");
          if (pieces[1] && pieces[2] && pieces[3]) print("all three pieces. now: submit flag{piece1_piece2_piece3}", "hl");
        });
      });
    },
    status: function () {
      [1, 2, 3].forEach(function (n) {
        var name = ["", "detect ", "contain", "recover"][n];
        printHTML("  " + (pieces[n] ? "<span class='ok'>[x]</span>" : d("[ ]")) + " " + n + " " + name + "  " + (pieces[n] ? h(esc(pieces[n])) : d("locked")));
      });
      print(solved ? "flag submitted ✓" : "flag: flag{piece1_piece2_piece3}", solved ? "ok" : "dim");
    },
    submit: function (args) {
      var guess = args.join(" ").trim();
      if (!guess) { print("usage: submit flag{...}", "err"); return; }
      return sha256bytes(guess).then(function (b) {
        if (b === null) print("submit: needs a secure context (https or localhost)", "err");
        else if (hex(b) === FLAG_SHA256) win();
        else print("✗ not quite. the flag is flag{piece1_piece2_piece3}; `status` shows your pieces.", "err");
      });
    },
    // easter eggs
    sudo: function () { print("guest is not in the sudoers file. This incident will be reported. 🙂", "err"); },
    echo: function (args) { print(args.join(" ")); }
  };
  var ALIASES = { "?": "help", man: "help", quit: "exit", q: "exit", cls: "clear", open: "goto",
                  projects: "ls projects", about: "cat ~/about.txt", skills: "cat ~/skills.txt", contact: "cat ~/contact.txt" };

  function win() {
    solved = true;
    printLines([
      "<span class='ok'>✓ flag accepted. incident closed.</span>",
      "<span class='ok'>  ┌─────────────────────────────┐</span>",
      "<span class='ok'>  │  secure by default. always. │</span>",
      "<span class='ok'>  └─────────────────────────────┘</span>",
      d("detect → contain → recover: the same loop I ran on my photo-site project."),
      d("let's talk: ") + h("cat ~/contact.txt")
    ]);
    try { localStorage.setItem("ctf_solved", "1"); } catch (e) {}
  }

  // ---------- Run ----------
  var history = [], hIndex = 0;

  function run(raw) {
    var line = raw.trim();
    printHTML("<span class='cmd'><b>guest@salah.sec:" + esc(cwd) + "$</b> " + esc(line) + "</span>");
    if (line) { history.push(line); }
    hIndex = history.length;
    if (!line) { scrollOut(); return; }

    var first = line.split(/\s+/)[0];
    var alias = Object.prototype.hasOwnProperty.call(ALIASES, first.toLowerCase()) && ALIASES[first.toLowerCase()];
    if (alias) line = alias + line.slice(first.length);
    var parts = line.split(/\s+/);
    var cmd = parts[0].toLowerCase();
    var fn = Object.prototype.hasOwnProperty.call(handlers, cmd) ? handlers[cmd] : null;
    var res = fn ? fn(parts.slice(1)) : print(cmd + ": command not found. type `help`.", "err");
    if (res && res.then) res.then(scrollOut); else scrollOut();
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
      var slash = last.lastIndexOf("/");
      var dirPart = slash === -1 ? "" : last.slice(0, slash + 1);
      var node = FS[resolve(dirPart || ".")];
      var namePart = last.slice(slash + 1);
      var pool = node && node.dir ? node.items.concat(node.hidden || []) : [];
      cands = pool.filter(function (f) { return f.indexOf(namePart) === 0 && (namePart[0] === "." || f[0] !== "."); })
                  .map(function (f) { return dirPart + f; });
      if (cands.length === 1) { parts[parts.length - 1] = cands[0]; input.value = parts.join(" "); return; }
    }
    if (cands && cands.length > 1) { print(cands.join("   "), "dim"); scrollOut(); }
  }

  // ---------- Open / close ----------
  var booted = false, lastFocus = null;

  function boot() {
    var lines = [
      d("booting salah.sec …"),
      "<span class='ok'>[ ok ]</span> session: guest",
      "<span class='ok'>[ ok ]</span> mounted ~/projects (3)",
      solved ? "<span class='ok'>[ ok ]</span> incident 0914: closed ✓" : "<span class='err'>[ !! ]</span> 1 unresolved security incident",
      "",
      h("salah.sec") + d(" v2 · type ") + h("help") + d(solved ? " to look around. welcome back, flag-finder." : " to begin. the incident is in here somewhere.")
    ];
    if (reduce.matches) { printLines(lines); return; }
    lines.forEach(function (l, i) { setTimeout(function () { printHTML(l); scrollOut(); }, 110 * i); });
  }

  function openTerm() {
    if (!term.hidden) { input.focus(); return; }
    lastFocus = document.activeElement;
    term.hidden = false;
    // next frame so the slide-in transition runs
    requestAnimationFrame(function () { term.classList.add("is-open"); });
    document.body.classList.add("term-open");
    toggleBtn.setAttribute("aria-expanded", "true");
    if (!booted) { booted = true; boot(); }
    // Don't pop the mobile keyboard automatically; users can tap chips first.
    if (window.matchMedia("(hover: hover)").matches) input.focus();
  }

  function closeTerm() {
    term.classList.remove("is-open");
    document.body.classList.remove("term-open");
    toggleBtn.setAttribute("aria-expanded", "false");
    var done = function () { term.hidden = true; };
    if (reduce.matches) done();
    else setTimeout(done, 350);
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
  if (hintBtn) hintBtn.addEventListener("click", openTerm);   // home page only
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

  setPrompt();
})();
