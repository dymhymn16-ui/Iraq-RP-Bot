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

// ======================================================
// قاعدة البيانات
// ======================================================

function ensureDatabase(db) {
    if (!db.users) db.users = {};
    if (!db.gangs) db.gangs = {};
    if (!db.jail) db.jail = {};
    if (!db.reports) db.reports = {};
    if (!db.wars) db.wars = {};
    if (!db.invites) db.invites = {};
    if (!db.missions) db.missions = {};

    return db;
}

function ensureUser(db, userId) {
    if (!db.users[userId]) {
        db.users[userId] = {
            balance: 0,
            wanted: false,
            wantedReason: null
        };
    }

    return db.users[userId];
}

// ======================================================
// أدوات
// ======================================================

function hasRole(member, roleId) {
    return member && member.roles && member.roles.cache.has(roleId);
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
        isOwner(member) ||
        hasRole(member, config.roles.policeLeader)
    );
}

function isPoliceDeputy(member) {
    return (
        isPoliceLeader(member) ||
        hasRole(member, config.roles.policeDeputy)
    );
}

function getUserGang(db, userId) {
    for (const [gangId, gang] of Object.entries(db.gangs)) {
        if (gang.members && gang.members.includes(userId)) {
            return {
                id: gangId,
                gang
            };
        }
    }

    return null;
}

function isGangMember(db, userId) {
    return !!getUserGang(db, userId);
}

function isGangLeader(db, userId) {
    const result = getUserGang(db, userId);

    if (!result) return false;

    return result.gang.leader === userId;
}

function isGangDeputy(db, userId) {
    const result = getUserGang(db, userId);

    if (!result) return false;

    return (
        result.gang.leader === userId ||
        result.gang.deputy === userId
    );
}

function formatMoney(amount) {
    return Number(amount || 0).toLocaleString('en-US');
}

async function addRole(member, roleId) {
    if (!roleId) return;

    if (!member.roles.cache.has(roleId)) {
        await member.roles.add(roleId);
    }
}

async function removeRole(member, roleId) {
    if (!roleId) return;

    if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
    }
}

// ======================================================
// الأوامر
// ======================================================

const commands = [

    // ---------------- الاقتصاد ----------------

    new SlashCommandBuilder()
        .setName('balance')
        .setDescription('عرض رصيدك'),

    new SlashCommandBuilder()
        .setName('addmoney')
        .setDescription('إضافة أموال للاعب')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('اللاعب')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('المبلغ')
                .setRequired(true)
                .setMinValue(1)
        ),

    new SlashCommandBuilder()
        .setName('removemoney')
        .setDescription('سحب أموال من لاعب')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('اللاعب')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('المبلغ')
                .setRequired(true)
                .setMinValue(1)
        ),

    // ---------------- العصابات ----------------

    new SlashCommandBuilder()
        .setName('creategang')
        .setDescription('إنشاء عصابة جديدة')
        .addStringOption(option =>
            option
                .setName('name')
                .setDescription('اسم العصابة')
                .setRequired(true)
                .setMaxLength(50)
        ),

    new SlashCommandBuilder()
        .setName('ganginfo')
        .setDescription('عرض معلومات العصابة'),

    new SlashCommandBuilder()
        .setName('ganginvite')
        .setDescription('دعوة لاعب إلى العصابة')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('اللاعب')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('gangkick')
        .setDescription('طرد عضو من العصابة')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('العضو')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('leavegang')
        .setDescription('مغادرة العصابة'),

    new SlashCommandBuilder()
        .setName('gangbank')
        .setDescription('عرض بنك العصابة'),

    new SlashCommandBuilder()
        .setName('gangstorage')
        .setDescription('عرض مخزن العصابة'),

    // ---------------- الشرطة ----------------

    new SlashCommandBuilder()
        .setName('policeinfo')
        .setDescription('عرض معلومات الشرطة'),

    new SlashCommandBuilder()
        .setName('policeinvite')
        .setDescription('دعوة لاعب إلى الشرطة')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('اللاعب')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('policekick')
        .setDescription('طرد عضو من الشرطة')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('العضو')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('policemissions')
        .setDescription('عرض مهام الشرطة'),

    // ---------------- السجن ----------------

    new SlashCommandBuilder()
        .setName('jail')
        .setDescription('سجن لاعب مؤقتًا')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('اللاعب')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('minutes')
                .setDescription('مدة السجن بالدقائق')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(1440)
        ),

    new SlashCommandBuilder()
        .setName('unjail')
        .setDescription('فك سجن لاعب')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('اللاعب')
                .setRequired(true)
        ),

    // ---------------- المطلوبين ----------------

    new SlashCommandBuilder()
        .setName('wanted')
        .setDescription('إضافة لاعب إلى المطلوبين')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('اللاعب')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('سبب المطلوبية')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('unwanted')
        .setDescription('إزالة لاعب من المطلوبين')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('اللاعب')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('arrest')
        .setDescription('القبض على مطلوب')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('المطلوب')
                .setRequired(true)
        ),

    // ---------------- البلاغات ----------------

    new SlashCommandBuilder()
        .setName('report')
        .setDescription('تقديم بلاغ')
        .addStringOption(option =>
            option
                .setName('text')
                .setDescription('محتوى البلاغ')
                .setRequired(true)
                .setMaxLength(500)
        ),

    // ---------------- السرقة ----------------

    new SlashCommandBuilder()
        .setName('rob')
        .setDescription('تنفيذ عملية سرقة'),

    // ---------------- الحرب ----------------

    new SlashCommandBuilder()
        .setName('war')
        .setDescription('بدء حرب'),

    // ---------------- المهام ----------------

    new SlashCommandBuilder()
        .setName('mission')
        .setDescription('عرض مهمتك الحالية')

].map(command => command.toJSON());

// ======================================================
// تشغيل البوت
// ======================================================

client.once('ready', async () => {

    console.log(`✅ تم تشغيل البوت باسم ${client.user.tag}`);

    const rest = new REST({ version: '10' })
        .setToken(process.env.TOKEN);

    try {

        await rest.put(
            Routes.applicationCommands(client.user.id),
            {
                body: commands
            }
        );

        console.log('✅ تم تسجيل جميع أوامر Slash');

    } catch (error) {

        console.error('❌ خطأ في تسجيل الأوامر:', error);

    }
});

// ======================================================
// الأوامر
// ======================================================

client.on('interactionCreate', async interaction => {

    if (!interaction.isChatInputCommand()) return;

    try {

        const db = ensureDatabase(getData());

        const userId = interaction.user.id;
        const member = interaction.member;

        ensureUser(db, userId);

        // ==================================================
        // BALANCE
        // ==================================================

        if (interaction.commandName === 'balance') {

            const user = ensureUser(db, userId);

            const embed = new EmbedBuilder()
                .setTitle('💰 رصيدك')
                .setDescription(
                    `💵 رصيدك الحالي:\n\n` +
                    `**${formatMoney(user.balance)} ${config.currencyName}**`
                )
                .setColor(0x00AA00);

            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }

        // ==================================================
        // ADD MONEY
        // ==================================================

        if (interaction.commandName === 'addmoney') {

            if (!isOwner(member)) {
                return interaction.reply({
                    content: '❌ هذا الأمر للمالك فقط.',
                    ephemeral: true
                });
            }

            const target = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');

            ensureUser(db, target.id);

            db.users[target.id].balance += amount;

            saveData(db);

            return interaction.reply(
                `✅ تمت إضافة **$${formatMoney(amount)}** إلى ${target}.`
            );
        }

        // ==================================================
        // REMOVE MONEY
        // ==================================================

        if (interaction.commandName === 'removemoney') {

            if (!isOwner(member)) {
                return interaction.reply({
                    content: '❌ هذا الأمر للمالك فقط.',
                    ephemeral: true
                });
            }

            const target = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');

            ensureUser(db, target.id);

            db.users[target.id].balance =
                Math.max(
                    0,
                    db.users[target.id].balance - amount
                );

            saveData(db);

            return interaction.reply(
                `✅ تم سحب **$${formatMoney(amount)}** من ${target}.`
            );
        }

        // ==================================================
        // CREATE GANG
        // ==================================================

        if (interaction.commandName === 'creategang') {

            if (!isOwner(member)) {
                return interaction.reply({
                    content: '❌ إنشاء العصابات للمالك فقط.',
                    ephemeral: true
                });
            }

            if (isGangMember(db, userId)) {
                return interaction.reply({
                    content: '❌ أنت موجود بالفعل في عصابة.',
                    ephemeral: true
                });
            }

            const name =
                interaction.options.getString('name');

            const gangId =
                `${Date.now()}_${userId}`;

            db.gangs[gangId] = {
                id: gangId,
                name: name,
                leader: userId,
                deputy: null,
                members: [userId],
                bank: 0,
                storage: {
                    weed: 0,
                    stolen: 0,
                    weapons: 0
                },
                wins: 0,
                losses: 0,
                createdAt: Date.now()
            };

            await addRole(
                member,
                config.roles.gangLeader
            );

            saveData(db);

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('🔫 تم إنشاء العصابة')
                        .setDescription(
                            `🏴 **اسم العصابة:** ${name}\n\n` +
                            `👑 **الزعيم:** ${interaction.user}\n` +
                            `👥 **الأعضاء:** 1\n` +
                            `💰 **البنك:** $0`
                        )
                        .setColor(0x8B0000)
                ]
            });
        }

        // ==================================================
        // GANG INFO
        // ==================================================

        if (interaction.commandName === 'ganginfo') {

            const result =
                getUserGang(db, userId);

            if (!result) {
                return interaction.reply({
                    content: '❌ أنت لست عضوًا في عصابة.',
                    ephemeral: true
                });
            }

            const gang = result.gang;

            const members =
                gang.members.length
                    ? gang.members.map(id => `<@${id}>`).join('\n')
                    : 'لا يوجد';

            const embed = new EmbedBuilder()
                .setTitle(`🔫 معلومات عصابة ${gang.name}`)
                .addFields(
                    {
                        name: '👑 الزعيم',
                        value: `<@${gang.leader}>`,
                        inline: true
                    },
                    {
                        name: '🥷 النائب',
                        value: gang.deputy
                            ? `<@${gang.deputy}>`
                            : 'غير محدد',
                        inline: true
                    },
                    {
                        name: '👥 عدد الأعضاء',
                        value: `${gang.members.length}`,
                        inline: true
                    },
                    {
                        name: '💰 بنك العصابة',
                        value:
                            `$${formatMoney(gang.bank)}`,
                        inline: true
                    },
                    {
                        name: '🌿 الحشيش',
                        value:
                            `${gang.storage.weed} كغ`,
                        inline: true
                    },
                    {
                        name: '📦 المسروقات',
                        value:
                            `${gang.storage.stolen}`,
                        inline: true
                    },
                    {
                        name: '🔫 الأسلحة',
                        value:
                            `${gang.storage.weapons}`,
                        inline: true
                    },
                    {
                        name: '🏆 الانتصارات',
                        value:
                            `${gang.wins}`,
                        inline: true
                    },
                    {
                        name: '💀 الخسائر',
                        value:
                            `${gang.losses}`,
                        inline: true
                    },
                    {
                        name: '👥 أعضاء العصابة',
                        value: members
                    }
                )
                .setColor(0x8B0000);

            return interaction.reply({
                embeds: [embed]
            });
        }

        // ==================================================
        // GANG INVITE
        // ==================================================

        if (interaction.commandName === 'ganginvite') {

            if (!isGangDeputy(db, userId)) {
                return interaction.reply({
                    content:
                        '❌ هذا الأمر للزعيم ونائب الزعيم فقط.',
                    ephemeral: true
                });
            }

            const result =
                getUserGang(db, userId);

            const target =
                interaction.options.getUser('user');

            if (target.bot) {
                return interaction.reply({
                    content: '❌ لا يمكن دعوة بوت.',
                    ephemeral: true
                });
            }

            if (isGangMember(db, target.id)) {
                return interaction.reply({
                    content:
                        '❌ هذا اللاعب موجود بعصابة بالفعل.',
                    ephemeral: true
                });
            }

            const inviteId =
                `gang_${Date.now()}_${userId}_${target.id}`;

            db.invites[inviteId] = {
                type: 'gang',
                gangId: result.id,
                from: userId,
                to: target.id,
                createdAt: Date.now()
            };

            saveData(db);

            const embed = new EmbedBuilder()
                .setTitle('📨 دعوة للانضمام إلى العصابة')
                .setDescription(
                    `🔫 **العصابة:** ${result.gang.name}\n` +
                    `👤 **العضو المدعو:** ${target}\n` +
                    `👑 **الداعي:** ${interaction.user}\n\n` +
                    `هل تريد الانضمام؟`
                )
                .setColor(0x8B0000);

            const row = new ActionRowBuilder()
                .addComponents(

                    new ButtonBuilder()
                        .setCustomId(
                            `gang_accept_${inviteId}`
                        )
                        .setLabel('✅ قبول')
                        .setStyle(ButtonStyle.Success),

                    new ButtonBuilder()
                        .setCustomId(
                            `gang_reject_${inviteId}`
                        )
                        .setLabel('❌ رفض')
                        .setStyle(ButtonStyle.Danger)
                );

            try {

                await target.send({
                    embeds: [embed],
                    components: [row]
                });

            } catch {

                return interaction.reply({
                    content:
                        '❌ لم أستطع إرسال الدعوة في الخاص. افتح الرسائل الخاصة من السيرفر.',
                    ephemeral: true
                });
            }

            return interaction.reply({
                content:
                    `✅ تم إرسال دعوة العصابة إلى ${target}.`,
                ephemeral: true
            });
        }

        // ==================================================
        // GANG KICK
        // ==================================================

        if (interaction.commandName === 'gangkick') {

            if (!isGangDeputy(db, userId)) {
                return interaction.reply({
                    content:
                        '❌ هذا الأمر للزعيم ونائب الزعيم فقط.',
                    ephemeral: true
                });
            }

            const result =
                getUserGang(db, userId);

            const target =
                interaction.options.getMember('user');

            if (!target) {
                return interaction.reply({
                    content: '❌ لم أجد العضو.',
                    ephemeral: true
                });
            }

            if (!result.gang.members.includes(target.id)) {
                return interaction.reply({
                    content:
                        '❌ هذا اللاعب ليس من أعضاء العصابة.',
                    ephemeral: true
                });
            }

            if (target.id === result.gang.leader) {
                return interaction.reply({
                    content:
                        '❌ لا يمكنك طرد زعيم العصابة.',
                    ephemeral: true
                });
            }

            result.gang.members =
                result.gang.members.filter(
                    id => id !== target.id
                );

            if (result.gang.deputy === target.id) {
                result.gang.deputy = null;
            }

            await removeRole(
                target,
                config.roles.gangMember
            );

            await removeRole(
                target,
                config.roles.gangDeputy
            );

            saveData(db);

            return interaction.reply(
                `✅ تم طرد ${target} من العصابة.`
            );
        }

        // ==================================================
        // LEAVE GANG
        // ==================================================

        if (interaction.commandName === 'leavegang') {

            const result =
                getUserGang(db, userId);

            if (!result) {
                return interaction.reply({
                    content:
                        '❌ أنت لست عضوًا في عصابة.',
                    ephemeral: true
                });
            }

            if (result.gang.leader === userId) {
                return interaction.reply({
                    content:
                        '❌ الزعيم لا يستطيع مغادرة العصابة.',
                    ephemeral: true
                });
            }

            result.gang.members =
                result.gang.members.filter(
                    id => id !== userId
                );

            if (result.gang.deputy === userId) {
                result.gang.deputy = null;
            }

            await removeRole(
                member,
                config.roles.gangMember
            );

            await removeRole(
                member,
                config.roles.gangDeputy
            );

            saveData(db);

            return interaction.reply(
                '✅ غادرت العصابة بنجاح.'
            );
        }

        // ==================================================
        // GANG BANK
        // ==================================================

        if (interaction.commandName === 'gangbank') {

            const result =
                getUserGang(db, userId);

            if (!result) {
                return interaction.reply({
                    content:
                        '❌ أنت لست عضوًا في عصابة.',
                    ephemeral: true
                });
            }

            return interaction.reply({
                content:
                    `💰 **بنك عصابة ${result.gang.name}**\n\n` +
                    `💵 الرصيد: **$${formatMoney(result.gang.bank)}**`,
                ephemeral: true
            });
        }

        // ==================================================
        // GANG STORAGE
        // ==================================================

        if (interaction.commandName === 'gangstorage') {

            const result =
                getUserGang(db, userId);

            if (!result) {
                return interaction.reply({
                    content:
                        '❌ أنت لست عضوًا في عصابة.',
                    ephemeral: true
                });
            }

            const storage =
                result.gang.storage;

            const embed = new EmbedBuilder()
                .setTitle(
                    `📦 مخزن ${result.gang.name}`
                )
                .addFields(
                    {
                        name: '🌿 الحشيش',
                        value:
                            `${storage.weed} كغ`,
                        inline: true
                    },
                    {
                        name: '📦 المسروقات',
                        value:
                            `${storage.stolen}`,
                        inline: true
                    },
                    {
                        name: '🔫 الأسلحة',
                        value:
                            `${storage.weapons}`,
                        inline: true
                    }
                )
                .setColor(0x228B22);

            return interaction.reply({
                embeds: [embed]
            });
        }

        // ==================================================
        // POLICE INFO
        // ==================================================

        if (interaction.commandName === 'policeinfo') {

            if (!isPolice(member) && !isOwner(member)) {
                return interaction.reply({
                    content:
                        '❌ هذه المعلومات للشرطة فقط.',
                    ephemeral: true
                });
            }

            const members =
                await interaction.guild.members.fetch();

            const leader =
                members.find(m =>
                    hasRole(
                        m,
                        config.roles.policeLeader
                    )
                );

            const deputies =
                members.filter(m =>
                    hasRole(
                        m,
                        config.roles.policeDeputy
                    )
                );

            const officers =
                members.filter(m =>
                    hasRole(
                        m,
                        config.roles.policeOfficer
                    )
                );

            const deputyText =
                deputies.size
                    ? deputies.map(
                        m => `<@${m.id}>`
                    ).join('\n')
                    : 'لا يوجد';

            const officerText =
                officers.size
                    ? officers.map(
                        m => `<@${m.id}>`
                    ).join('\n')
                    : 'لا يوجد';

            const embed = new EmbedBuilder()
                .setTitle('🚔 معلومات الشرطة')
                .addFields(
                    {
                        name: '👑 قائد الشرطة',
                        value: leader
                            ? `<@${leader.id}>`
                            : 'غير محدد'
                    },
                    {
                        name: '🥷 نواب الشرطة',
                        value: deputyText
                    },
                    {
                        name: '👮 أعضاء الشرطة',
                        value: officerText
                    }
                )
                .setColor(0x0066FF);

            return interaction.reply({
                embeds: [embed]
            });
        }

        // ==================================================
        // POLICE INVITE
        // ==================================================

        if (interaction.commandName === 'policeinvite') {

            if (!isPoliceDeputy(member)) {
                return interaction.reply({
                    content:
                        '❌ هذا الأمر لقائد الشرطة ونائبه فقط.',
                    ephemeral: true
                });
            }

            const target =
                interaction.options.getUser('user');

            const targetMember =
                await interaction.guild.members
                    .fetch(target.id);

            if (isPolice(targetMember)) {
                return interaction.reply({
                    content:
                        '❌ هذا اللاعب موجود بالفعل في الشرطة.',
                    ephemeral: true
                });
            }

            const inviteId =
                `police_${Date.now()}_${userId}_${target.id}`;

            db.invites[inviteId] = {
                type: 'police',
                from: userId,
                to: target.id,
                createdAt: Date.now()
            };

            saveData(db);

            const embed = new EmbedBuilder()
                .setTitle('📨 دعوة للانضمام إلى الشرطة')
                .setDescription(
                    `🚔 **الجهة:** الشرطة\n` +
                    `👤 **العضو المدعو:** ${target}\n` +
                    `👮 **الداعي:** ${interaction.user}\n\n` +
                    `هل تريد الانضمام إلى الشرطة؟`
                )
                .setColor(0x0066FF);

            const row = new ActionRowBuilder()
                .addComponents(

                    new ButtonBuilder()
                        .setCustomId(
                            `police_accept_${inviteId}`
                        )
                        .setLabel('✅ قبول')
                        .setStyle(ButtonStyle.Success),

                    new ButtonBuilder()
                        .setCustomId(
                            `police_reject_${inviteId}`
                        )
                        .setLabel('❌ رفض')
                        .setStyle(ButtonStyle.Danger)
                );

            try {

                await target.send({
                    embeds: [embed],
                    components: [row]
                });

            } catch {

                return interaction.reply({
                    content:
                        '❌ لا أستطيع إرسال الرسالة الخاصة لهذا اللاعب.',
                    ephemeral: true
                });
            }

            return interaction.reply({
                content:
                    `✅ تم إرسال دعوة الشرطة إلى ${target}.`,
                ephemeral: true
            });
        }

        // ==================================================
        // POLICE KICK
        // ==================================================

        if (interaction.commandName === 'policekick') {

            if (!isPoliceLeader(member)) {
                return interaction.reply({
                    content:
                        '❌ طرد الشرطة متاح لقائد الشرطة فقط.',
                    ephemeral: true
                });
            }

            const target =
                interaction.options.getMember('user');

            if (!target) {
                return interaction.reply({
                    content:
                        '❌ لم أجد العضو.',
                    ephemeral: true
                });
            }

            if (hasRole(
                target,
                config.roles.policeLeader
            )) {
                return interaction.reply({
                    content:
                        '❌ لا يمكنك طرد قائد الشرطة.',
                    ephemeral: true
                });
            }

            await removeRole(
                target,
                config.roles.policeOfficer
            );

            await removeRole(
                target,
                config.roles.policeDeputy
            );

            return interaction.reply(
                `✅ تم طرد ${target} من الشرطة.`
            );
        }

        // ==================================================
        // POLICE MISSIONS
        // =================================================
