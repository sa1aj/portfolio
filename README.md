# salah.sec: personal portfolio

Personal portfolio for the AWS Builder Center student portfolio hackathon.

- **Sections:** About Me, Skills, Projects
- **Creative feature:** terminal mode. Press <kbd>`</kbd> or tap `>_`, then try `help`, `whoami`, `ls projects`.
  There's also a hidden three-stage capture-the-flag built on real cloud-security tasks (hint: `ls -a`).
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

The CTF stores only SHA-256 hashes of the stage answers and the flag, plus each flag piece encrypted with a key derived from its answer. The puzzle is in the source; the flag isn't readable there.
