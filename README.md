# Field Activity Tracker

ប្រព័ន្ធ Web សម្រាប់កត់ត្រាសកម្មភាពក្រុមការងារ (Merchant Visit, POS, Soundbox)

- **Frontend**: GitHub Pages (`index.html`, `style.css`, `app.js`, `config.js`)
- **Backend**: Google Apps Script (`Code.gs`) → Google Sheets + Telegram Bot
- **Roles**: `admin` (Dashboard + Export) / `user` (បញ្ចូលទិន្នន័យ + មើល/Export លទ្ធផលខ្លួនឯង)
- រូបភាព៖ ផ្ញើទៅ Telegram តែប៉ុណ្ណោះ (មិនកត់ក្នុង Sheets)

## ជំហានដំឡើង

### 1. Telegram Bot
1. ក្នុង Telegram ជជែកជាមួយ **@BotFather** → `/newbot` → ចម្លង **BOT_TOKEN**
2. បង្កើត Group → Add bot ចូល Group (ជា Admin បើចង់)
3. ផ្ញើសារណាមួយក្នុង Group រួចបើក `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates` → រក `"chat":{"id":-100xxxxxxxxxx}` នោះគឺ **CHAT_ID**

### 2. Google Sheets + Apps Script
1. បង្កើត Google Sheet ថ្មី → **Extensions → Apps Script**
2. Paste ខ្លឹមសារ `Code.gs` ជំនួសកូដដើម
3. **Project Settings → Script properties** ដាក់៖
   - `BOT_TOKEN` = token របស់ bot
   - `CHAT_ID` = id របស់ Group
   - `SECRET` = អក្សរចៃដន្យវែងៗ (ឬរត់ `setup` វានឹងបង្កើតឱ្យ)
4. រត់ function `setup` (អនុញ្ញាត permissions)
5. កែ `addUser()` ដាក់ username/password/role/ឈ្មោះ រួចរត់ — ធ្វើម្តងទៀតសម្រាប់ user នីមួយៗ (role = `admin` ឬ `user`)
6. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - ចម្លង **Web app URL**

> ពេលកែ Code.gs ក្រោយមក ត្រូវ **Deploy → Manage deployments → Edit → New version**

### 3. Frontend → GitHub Pages
1. កែ `config.js` ដាក់ `API_URL` = Web app URL
2. Upload ឯកសារទាំងអស់ (លើកលែង `Code.gs`, README) ទៅ GitHub repo
3. **Settings → Pages → Branch: main / root → Save**
4. បើក `https://<username>.github.io/<repo>/`

## ការប្រើប្រាស់
- **User**: Login → ជ្រើស Activity Type → Scan QR (ទាញ Name/MID/TID ស្វ័យប្រវត្តិ) → ទីតាំង (GPS ឬ Map) → Business Hour → រូបភាព → Submit
- **Admin**: Dashboard (stats, charts, filter, តារាង) + Export CSV / Excel

## កំណត់ចំណាំ
- **Users**: Admin អាចបន្ថែម/កែ/លុប user នៅ tab "👥 Users" (ប្តូរ password ដោយទុក Password ទទេ = មិនប្តូរ)។ មិនចាំបាច់រត់ `addUser()` ទៀតទេ លើកលែង Admin ដំបូង។
- **QR Parsing**: គាំទ្រ KHQR/EMV (Name = tag 59, MID = tag 29 ឬ 30 → sub-tag 00, TID = tag 62-07). ធនាគារខ្លះប្រើទម្រង់ផ្សេង — ពិនិត្យ "Raw QR text" ហើយកែ `decodeQR()` ក្នុង `app.js` តាមទម្រង់ QR ពិតរបស់អ្នក។ វាលទាំងអស់កែបានដោយដៃ។
- **សុវត្ថិភាព**: BOT_TOKEN នៅក្នុង Apps Script (មិនលេចចេញក្នុង frontend)។ ប្តូរ password ដើម `ChangeMe123` ភ្លាមៗ។ Token login មានអាយុ 12 ម៉ោង។
- Camera / GPS ត្រូវការ **HTTPS** (GitHub Pages គាំទ្រ)។
- Apps Script មានដែនកំណត់ទំហំ request — រូបភាពត្រូវបានបង្រួម (≤1280px) មុនផ្ញើ; អតិបរមា 10 សន្លឹក/ដង។
