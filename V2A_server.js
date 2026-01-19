const express = require('express');
const multer = require('multer');
const vcard = require('vcard-parser');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// 1. LOGIN SYSTEM
app.post('/api/login', (req, res) => {
    if (req.body.password === "3m") {
        res.cookie('auth', 'true', { httpOnly: true });
        return res.sendStatus(200);
    }
    res.status(401).send('Incorrect password.');
});

// 2. ERROR-PROOF DEEP SYNC
app.post('/api/upload', upload.single('vcfFile'), async (req, res) => {
    try {
        const rawData = req.file.buffer.toString();
        const parsed = vcard.parse(rawData);
        
        // --- DATA EXTRACTION ---
        const nameData = parsed.n ? parsed.n[0].value : [];
        const lastName = nameData[0] || "";
        const firstName = nameData[1] || "New Contact";
        const company = (parsed.org ? parsed.org[0].value : "") || "";
        
        // --- SMART NOTES ---
        // We combine the original notes with the State (if found) so data isn't lost
        let finalNotes = (parsed.note ? parsed.note[0].value : "") || "";
        const addr = parsed.adr ? parsed.adr[0].value : [];
        const stateText = addr[4] || ""; 
        
        if (stateText) {
            finalNotes += `\n[Imported State: ${stateText}]`;
        }
        
        // --- SAFE MAILING ADDRESS ---
        // We OMIT 'state' here to prevent the JSON conversion error
        const mailingAddress = {
            street1: addr[2] || "",
            city: addr[3] || "",
            zipCode: addr[5] || ""
        };

        const emailAddresses = (parsed.email || []).map((e, i) => ({
            address: e.value,
            isPrimary: i === 0
        }));

        const phoneNumbers = (parsed.tel || []).map((p, i) => ({
            number: p.value,
            isPrimary: i === 0
        }));

        const apiKey = process.env.ACCULYNX_API_KEY.trim();
        const contactTypeId = process.env.ACCULYNX_DEFAULT_CONTACT_TYPE_ID.trim();
        const headers = { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        const contactData = {
            firstName: firstName,
            lastName: lastName,
            companyName: company,
            contactTypeIds: [contactTypeId],
            emailAddresses: emailAddresses,
            phoneNumbers: phoneNumbers,
            mailingAddress: mailingAddress,
            notes: finalNotes, // Now includes the state!
            billingAddressSameAsMailingAddress: true 
        };

        const response = await axios.post('https://api.acculynx.com/api/v2/contacts', contactData, { headers });
        res.send(`Success! Contact created: ${firstName} ${lastName}`);

    } catch (err) {
        let detailedError = err.response ? JSON.stringify(err.response.data) : err.message;
        console.error('SYNC ERROR:', detailedError);
        res.status(500).send(`Sync Failed: ${detailedError}`);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
