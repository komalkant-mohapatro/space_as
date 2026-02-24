# Deployment Guide: Astronomy Web App

This guide explains how to deploy your Astronomy Web App to **Vercel** and how to run it locally.

## 🚀 Deployment to Vercel (Recommended)

The easiest way to deploy is using the **Vercel GitHub Integration**.

### 1. Push to GitHub
If you haven't already, push your code to a GitHub repository:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/your-repo-name.git
git push -u origin main
```

### 2. Connect to Vercel
1. Go to [vercel.com](https://vercel.com) and sign in.
2. Click **"Add New..."** -> **"Project"**.
3. Import your GitHub repository.
4. Vercel will automatically detect the settings from `vercel.json`.
5. Click **Deploy**.

### 3. Verification
Once deployed, Vercel will provide a public URL (e.g., `your-app.vercel.app`). Your app should work immediately!

---

## 💻 Local Development

To run the app on your computer:

### 1. Install Dependencies
Make sure you have Python installed, then run:
```bash
pip install -r requirements.txt
```

### 2. Run the Server
```bash
python ASTRO_SERVER.py
```
The app will be available at `http://localhost:8000`.

---

## 🛠 Troubleshooting & Notes

> [!NOTE]
> **Data Loading**: I've updated `app/astro_calc.py` to handle Vercel's read-only filesystem. It uses the `/tmp` directory for any necessary astronomical data downloads.

> [!TIP]
> **Vercel CLI**: If you prefer the command line, install the Vercel CLI (`npm install -g vercel`) and run `vercel` in the project root.
