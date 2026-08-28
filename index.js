const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');

const { getData, saveData } = require('./database');
const config = require('./config');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// =====================================================
// أدوات مساعدة
// =====================================================

function dbInit() {
    const db = getData();

    db.users ??= {};
    db.gangs ??= {};
    db.jail ??= {};
    db.reports ??= {};
    db.invites ??= {};
    db.missions ??= {};
    db.wars ??= {};

    return db;
}

function userData(db, id) {
    db.users[id] ??= {
        balance: 0,
        wanted: false,
        wantedReason: null
    };

    return db.users[id];
}

function hasRole(member, roleId) {
    return !!roleId && member.roles.cache.has(roleId);
}

function isOwner(member) {
    return hasRole(member, config.roles.owner);
}

function isPolice(member) {
    return (
        hasRole(member, config.roles.policeLeader) ||
        hasRole(member, config.roles.policeDeputy) ||
        hasRole(member, config.roles.policeOfficer)
    );
}

function isPoliceLeader(member) {
    return (
        hasRole(member, config.roles.policeLeader) ||
        isOwner(member)
    );
}

function isPoliceDeputy(member) {
    return (
        hasRole(member, config.roles.policeDeputy) ||
        isPoliceLeader(member)
    );
}

function getGang(db, userId) {
    for (const [id, gang] of Object.entries(db.gangs)) {
        if (gang.members?.includes(userId)) {
            return { id, gang };
        }
    }

    return null;
}

function isGangLeader(db, userId) {
    const result = getGang(db, userId);
    return !!result && result.gang.leader === userId;
}

function isGangDeputy(db, userId) {
    const result = getGang(db, userId);

    return (
        !!result &&
        (
            result.gang.leader === userId ||
            result.gang.deputy === userId
        )
    );
}

function money(amount) {
    return Number(amount || 0).toLocaleString();
}

async function giveRole(member, roleId) {
    if (!roleId) return;

    if (!member.roles.cache.has(roleId)) {
        await member.roles.add(roleId);
    }
}

async function takeRole(member, roleId) {
    if (!roleId) return;

    if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
    }
}

// =====================================================
// الأوامر
// =====================================================

const commands = [

    new SlashCommandBuilder()
        .setName('balance')
        .setDescription('عرض رصيدك'),

    new SlashCommandBuilder()
        .setName('addmoney')
        .setDescription('إضافة أموال')
        .addUserOption(o =>
            o.setName('user')
                .setDescription('العضو')
                .setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName('amount')
                .setDescription('المبلغ')
                .setRequired(true)
                .setMinValue(1)
        ),

    new SlashCommandBuilder()
        .setName('removemoney')
        .setDescription('سحب أموال')
        .addUserOption(o =>
            o.setName('user')
                .setDescription('العضو')
                .setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName('amount')
                .setDescription('المبلغ')
                .setRequired(true)
                .setMinValue(1)
        ),

    // العصابات

    new SlashCommandBuilder()
        .setName('creategang')
        .setDescription('إنشاء عصابة')
        .addStringOption(o =>
            o.setName('name')
                .setDescription('اسم العصابة')
                .setRequired(true)
                .setMaxLength(50)
        ),

    new SlashCommandBuilder()
        .setName('ganginfo')
        .setDescription('معلومات العصابة'),

    new SlashCommandBuilder()
        .setName('ganginvite')
        .setDescription('دعوة عضو للعصابة')
        .addUserOption(o =>
            o.setName('user')
                .setDescription('العضو')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('gangkick')
        .setDescription('طرد عضو من العصابة')
        .addUserOption(o =>
            o.setName('user')
                .setDescription('العضو')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('leavegang')
        .setDescription('مغادرة العصابة'),

    new SlashCommandBuilder()
        .setName('gangbank')
        .setDescription('بنك العصابة'),

    new SlashCommandBuilder()
        .setName('gangstorage')
        .setDescription('مخزن العصابة'),

    // الشرطة

    new SlashCommandBuilder()
        .setName('policeinfo')
        .setDescription('معلومات الشرطة'),

    new SlashCommandBuilder()
        .setName('policeinvite')
        .setDescription('دعوة عضو للشرطة')
        .addUserOption(o =>
            o.setName('user')
                .setDescription('العضو')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('policekick')
        .setDescription('طرد عضو من الشرطة')
        .addUserOption(o =>
            o.setName('user')
                .setDescription('العضو')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('pol
