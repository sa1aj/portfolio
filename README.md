# salah.sec: personal portfolio

Personal portfolio for the AWS Builder Center student portfolio hackathon.

- **Sections:** About Me, Skills, Projects
- **Creative feature:** terminal mode. Press <kbd>`</kbd> or tap `>_`, then try `help`, `whoami`, `ls projects`.
  There's also a hidden capture-the-flag challenge (hint: `ls -a`).
- **Stack:** plain HTML, CSS and JavaScript with no build step or dependencies
- **Hosting:** AWS Amplify Hosting, deployed from this GitHub repo

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Structure

```
index.html        page markup
css/style.css     styles (mobile-first, light/dark)
js/terminal.js    terminal mode + CTF
assets/           images, favicon
amplify.yml       Amplify build settings (static, no build)
```

The CTF flag is stored only as a SHA-256 hash. The puzzle is in the source; the answer isn't.
