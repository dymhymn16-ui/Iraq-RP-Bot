const fs = require('fs');
const path = require('path');

const dbFile = path.join(__dirname, 'database.json');

// قراءة البيانات
function getData() {
    if (!fs.existsSync(dbFile)) {
        fs.writeFileSync(
            dbFile,
            JSON.stringify({ users: {}, gangs: {}, jail: {} }, null, 2)
        );
    }

    return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
}

// حفظ البيانات
function saveData(data) {
    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

module.exports = { getData, saveData };
