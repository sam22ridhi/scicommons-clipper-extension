
# 🖇️ SciCommons Chrome Clipper

**A browser extension to instantly save scientific articles to your SciCommons library.**

This extension automatically detects DOIs on research websites (like PubMed, Nature, PLOS), fetches metadata via CrossRef, and submits the article to your SciCommons dashboard with a single click.

##  Features

* **Auto-Detection:** Automatically finds the DOI of the paper you are reading.
* **Metadata Fetching:** Retrieves Title, Abstract, and Authors using the CrossRef API.
* **Secure Submission:** Uses JWT Authentication to submit articles to your account.
* **Instant Redirect:** Automatically opens your saved article in the SciCommons library.

## 🛠️ Installation (Developer Mode)

Since this is an MVP extension, you need to load it into Chrome manually:

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Toggle **Developer mode** (top right switch).
4. Click **Load unpacked**.
5. Select the folder containing this code (the folder with `manifest.json`).
6. The **SciCommons Clipper** icon will appear in your toolbar!

##  How to Use

1. **Login:** Ensure you have an Authentication Token from your local SciCommons instance.
2. **Browse:** Go to any scientific article (e.g., on [Nature](https://www.nature.com) or [PubMed](https://pubmed.ncbi.nlm.nih.gov)).
3. **Clip:** Click the SciCommons extension icon.
* It will auto-fill the details found.


4. **Submit:** Click **"Submit to Library"**.
* The extension will save the article and open it in your local SciCommons dashboard.


## 🔑 Authentication Setup

To use the extension, you need a valid **Auth Token** from your SciCommons account.

### 🔑 How to get your Auth Token (Backend Method)
You can generate a token directly via the API:

1. Go to the API Docs: [http://127.0.0.1:8000/api/docs](http://127.0.0.1:8000/api/docs)
2. Find the **Users** section and open `POST /api/users/login`.
3. Click **Try it out**.
4. Enter your credentials:
   ```json
   {
     "username": "admin",
     "password": "your_password"
   }
5. Then click execute
6. And auth token is generated you can copy paste that into the the extension

Below is the image
<img width="2880" height="1556" alt="image" src="https://github.com/user-attachments/assets/14b49291-d320-473b-b402-c07b7395a020" />

## ⚙️ Configuration

Currently configured for local development:

* **Backend URL:** `http://127.0.0.1:8000/api/articles/articles/`
* **Frontend Redirect:** `http://localhost:3000/articles/`

##  Contributing

This is an open-source project for **SciCommons**. Feel free to open issues or submit PRs to improve the DOI detection or UI!
