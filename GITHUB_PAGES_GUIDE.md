# GitHub Pages Deployment Guide
## Elijah Whittle — Portfolio

---

## Step 1 — Create a GitHub repository

1. Go to **github.com** and sign in (or create an account at github.com/signup).
2. Click the **+** icon in the top-right → **New repository**.
3. Name it exactly: `ewlisten.github.io`
   - (Replace `ewlisten` with your exact GitHub username — this is important.)
   - If you name it `<yourusername>.github.io`, GitHub Pages activates automatically and your site will be live at `https://<yourusername>.github.io`.
4. Set visibility to **Public**.
5. Leave all checkboxes unchecked (no README, no .gitignore).
6. Click **Create repository**.

---

## Step 2 — Install Git (if you don't have it)

Open **Command Prompt** (press `Win + R`, type `cmd`, hit Enter) and run:

```
git --version
```

If you see a version number, you're good. If not, download Git from **git-scm.com/download/win** and install it with default settings.

---

## Step 3 — Open your portfolio folder in the terminal

In Command Prompt, navigate to your portfolio folder:

```
cd "C:\Users\whitt\OneDrive\Desktop\Folder 4 Claude\Resume\Portforlio Folder"
```

---

## Step 4 — Initialize Git and make your first commit

Run these commands one at a time:

```
git init
git checkout -b main
git add index.html portfolio.css portfolio.js
```

Now add all the media and data files:

```
git add ELIpfp.jpg Wemby_StpBK.gif TyMax_3.gif
git add Wemby_StpBK_TrajectOV.mp4
git add player_profiles.json
git add Wemby11_10_25.json Wemby3_05_26.json Wemby3_10_26.json
git add Wemby3_30_26.json Wemby4_1_26.json Wemby4_10_26.json
git add WembyPreAllstar.json WembyPostAllstar.json WembyFull26.json
git add Maxey11_20_25.json Maxey1_12_26.json Maxey1_3_26.json
git add Maxey2_22_26.json Maxey2_2_26.json Maxey_1_31_26.json
git add Maxey_FullSeason.json Maxey_PostAllstar.json Maxey_PreAllstar.json
git add telemetry_LEC_canada.json telemetry_STR_canada.json telemetry_PIA_canada.json
git add telemetry_LEC_jeddah.json telemetry_STR_jeddah.json telemetry_PIA_jeddah.json
git add telemetry_LEC_miami.json  telemetry_STR_miami.json  telemetry_PIA_miami.json
```

Then commit:

```
git commit -m "Initial portfolio deploy"
```

---

## Step 5 — Handle the Monaco video (IMPORTANT — 92 MB file)

GitHub blocks individual files over 100 MB and warns on files over 50 MB. The Monaco video (`Monaco Draft Animation.mp4`) is ~92 MB — technically under the hard limit but large enough to cause push failures on slower connections. You have two options:

### Option A — Push it directly (simplest, usually works)
```
git add "Monaco Draft Animation.mp4"
git commit -m "Add Monaco video"
```
Then push as normal in Step 6. If GitHub rejects it, use Option B.

### Option B — Host the video on Google Drive or YouTube (recommended for long-term)
1. Upload `Monaco Draft Animation.mp4` to Google Drive and set sharing to "Anyone with the link."
2. In `index.html` (and `Portfolio_Mosaic.html`), replace:
   ```html
   <source src="Monaco%20Draft%20Animation.mp4" type="video/mp4">
   ```
   with a YouTube embed or a direct Drive streaming link.
3. Don't add the .mp4 to git at all.

---

## Step 6 — Push to GitHub

Connect your local repo to GitHub (replace `ewlisten` with your username):

```
git remote add origin https://github.com/ewlisten/ewlisten.github.io.git
git push -u origin main
```

GitHub will ask for your username and password. For the password, use a **Personal Access Token** (not your account password):
- Go to **github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)**
- Click **Generate new token**, check the `repo` scope, generate, and paste that as your password.

---

## Step 7 — Enable GitHub Pages

1. Go to your repo on GitHub: `github.com/ewlisten/ewlisten.github.io`
2. Click **Settings** (top tab) → **Pages** (left sidebar).
3. Under **Source**, select **Deploy from a branch**.
4. Branch: **main** / folder: **/ (root)**.
5. Click **Save**.

GitHub will show a banner: *"Your site is live at https://ewlisten.github.io"*

It takes 1–3 minutes for the first deploy. After that, every `git push` auto-updates the live site within ~30 seconds.

---

## Step 8 — Verify everything works

Open `https://<yourusername>.github.io` in a browser and check:

- [ ] Mosaic grid loads — 4 panels visible
- [ ] NBA overlay opens → shot chart loads a game → dots animate
- [ ] Filter pills (MADE / MISSED / 2PT / 3PT / zones) work
- [ ] WEMBY / MAXEY switcher works
- [ ] F1 overlay opens → Monaco video plays → Lap Delta canvas renders → Telemetry canvas renders
- [ ] CV overlay opens → trajectory video plays → Maxey GIF loads
- [ ] About overlay opens → your photo loads

---

## Files NOT to push (leave these out)

These files are either unused, replaced, or old working copies — don't add them to git:

| File | Reason |
|------|--------|
| `WEMBY11_10_25 (1).json` etc. | Old duplicates with spaces in names — replaced by clean-named copies |
| `WEMBYFullSeason.json` | Replaced by `WembyFull26.json` |
| `WEMBYPreAllstar (1).json` | Replaced by `WembyPreAllstar.json` |
| `WEMBYPostAllstar (1).json` | Replaced by `WembyPostAllstar.json` |
| `TyMax_3.avi` | Old format — replaced by `TyMax_3.gif` |
| `Wemby_StpBK_TrajectOV.mov` | Old format — replaced by `.mp4` |
| `telemetry_data.json` | Old naming — not referenced by JS |
| `telemetry_STRdata.json` | Old naming — not referenced by JS |
| `telemetry_PIAdata.json` | Old naming — not referenced by JS |
| `TyMax_3_analyzed (1).json` | Has parentheses in filename — not referenced by JS |
| `PortfolioV2.html` | Old version |
| `teamfingerprint.PNG` | Not referenced in current site |
| `ShotchartA.PNG` / `ShotchartB.PNG` | Not referenced in current site |
| `Making an Awesome Portfolio/` | Old working folder |
| `Portfolio_Mosaic.html` | Duplicate of `index.html` — not needed on GitHub |

---

## Future updates

Any time you make changes, run:

```
cd "C:\Users\whitt\OneDrive\Desktop\Folder 4 Claude\Resume\Portforlio Folder"
git add -u
git commit -m "Update portfolio"
git push
```

The site refreshes automatically within ~30 seconds.
