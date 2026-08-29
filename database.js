const fs = require('fs');
const path = require('path');

const dbFile = path.join(__dirname, 'database.json');

// قراءة البيانات مع حماية ضد التلف
function getData() {
    try {
        if (!fs.existsSync(dbFile)) {
            const initialData = { users: {}, gangs: {}, jail: {} };
            fs.writeFileSync(dbFile, JSON.stringify(initialData, null, 2));
            return initialData;
        }

        const fileContent = fs.readFileSync(dbFile, 'utf8');
        if (!fileContent.trim()) {
            return { users: {}, gangs: {}, jail: {} };
        }

        return JSON.parse(fileContent);
    } catch (error) {
        console.error("⚠️ خطأ في قراءة قاعدة البيانات، يتم إعادة تعيين الملف لتجنب توقف البوت:", error);
        const safeData = { users: {}, gangs: {}, jail: {} };
        fs.writeFileSync(dbFile, JSON.stringify(safeData, null, 2));
        return safeData;
    }
}

// حفظ البيانات
function saveData(data) {
    try {
        fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("❌ خطأ أثناء حفظ البيانات:", error);
    }
}

module.exports = { getData, saveData };
