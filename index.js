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
// أدوات قاعدة البيانات
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
// الرتب
// ======================================================

function hasRole(member, roleId) {
    return !!roleId && member.roles.cache.has(roleId);
}

function isOwner(member) {
    return hasRole(member, config.roles.owner);
}

function isPolice(member) {
    return (
        isOwner(member) ||
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
        isOwner(member) ||
        hasRole(member, config.roles.policeLeader) ||
        hasRole(member, config.roles.policeDeputy)
    );
}

// ======================================================
// العصابات
// ======================================================

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

// ======================================================
// المال
// ======================================================

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

    // --------------------------
    // الاقتصاد
    // --------------------------

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

    // --------------------------
    // العصابات
    // --------------------------

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
                .setDescription('اللاعب المدعو')
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

    // --------------------------
    // الشرطة
    // --------------------------

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

    // --------------------------
    // السجن
    // --------------------------

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

    // --------------------------
    // المطلوبين
    // --------------------------

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
                .setMaxLength(300)
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

    // --------------------------
    // السرقة
    // --------------------------

    new SlashCommandBuilder()
        .setName('rob')
        .setDescription('تنفيذ عملية سرقة'),

    // --------------------------
    // الحرب
    // --------------------------

    new SlashCommandBuilder()
        .setName('war')
        .setDescription('بدء حرب بين الشرطة والعصابة'),

    // --------------------------
    // المهام
    // --------------------------

    new SlashCommandBuilder()
        .setName('mission')
        .setDescription('عرض مهمتك الحالية')

].map(command => command.toJSON());

// ======================================================
// تشغيل البوت وتسجيل الأوامر
// ======================================================

client.once('ready', async () => {

    console.log(`✅ تم تشغيل البوت باسم ${client.user.tag}`);

    if (!process.env.TOKEN) {
        console.error('❌ TOKEN غير موجود في Environment Variables');
        return;
    }

    const rest = new REST({
        version: '10'
    }).setToken(process.env.TOKEN);

    try {

        await rest.put(
            Routes.applicationCommands(client.user.id),
            {
                body: commands
            }
        );

        console.log('✅ تم تسجيل جميع أوامر Slash بنجاح');

    } catch (error) {

        console.error('❌ خطأ في تسجيل الأوامر:', error);

    }
});

// ======================================================
// أوامر Slash
// ======================================================

client.on('interactionCreate', async interaction => {

    if (!interaction.isChatInputCommand()) return;

    try {

        let db = ensureDatabase(getData());

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
                    content: '❌ هذا الأمر مخصص للمالك فقط.',
                    ephemeral: true
                });
            }

            const target = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');

            ensureUser(db, target.id);

            db.users[target.id].balance += amount;

            saveData(db);

            return interaction.reply(
                `✅ تمت إضافة **${formatMoney(amount)} ${config.currencyName}** إلى ${target}.`
            );
        }

        // ==================================================
        // REMOVE MONEY
        // ==================================================

        if (interaction.commandName === 'removemoney') {

            if (!isOwner(member)) {
                return interaction.reply({
                    content: '❌ هذا الأمر مخصص للمالك فقط.',
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
                `✅ تم سحب **${formatMoney(amount)} ${config.currencyName}** من ${target}.`
            );
        }

        // ==================================================
        // CREATE GANG
        // ==================================================

        if (interaction.commandName === 'creategang') {

            if (!isOwner(member)) {
                return interaction.reply({
                    content: '❌ إنشاء العصابات متاح للمالك فقط.',
                    ephemeral: true
                });
            }

            if (isGangMember(db, userId)) {
                return interaction.reply({
                    content: '❌ أنت موجود أصلًا في عصابة.',
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

            const embed = new EmbedBuilder()
                .setTitle('🔫 تم إنشاء العصابة')
                .setDescription(
                    `🏴 **اسم العصابة:** ${name}\n\n` +
                    `👑 **الزعيم:** ${interaction.user}\n` +
                    `👥 **الأعضاء:** 1\n` +
                    `💰 **البنك:** $0`
                )
                .setColor(0x8B0000);

            return interaction.reply({
                embeds: [embed]
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
                    content: '❌ أنت لست عضوًا في أي عصابة.',
                    ephemeral: true
                });
            }

            const gang = result.gang;

            const members =
                gang.members.length
                    ? gang.members
                        .map(id => `<@${id}>`)
                        .join('\n')
                    : 'لا يوجد أعضاء';

            const embed = new EmbedBuilder()
                .setTitle(`🔫 معلومات عصابة ${gang.name}`)
                .addFields(

                    {
                        name: '👑 الزعيم',
                        value: `<@${gang.leader}>`,
                        inline: true
                    },

                    {
                        name: '🥷 نائب الزعيم',
                        value:
                            gang.deputy
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

            if (target.id === userId) {
                return interaction.reply({
                    content: '❌ لا يمكنك دعوة نفسك.',
                    ephemeral: true
                });
            }

            if (isGangMember(db, target.id)) {
                return interaction.reply({
                    content:
                        '❌ هذا اللاعب موجود أصلًا في عصابة.',
                    ephemeral: true
                });
            }

            const targetMember =
                await interaction.guild.members.fetch(target.id);

            if (isPolice(targetMember)) {
                return interaction.reply({
                    content:
                        '❌ لا يمكن دعوة أحد أفراد الشرطة إلى العصابة.',
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
                    `هل تريد الانضمام إلى العصابة؟`
                )
                .setColor(0x8B0000);

            const row =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `gang_accept_${inviteId}`
                            )
                            .setLabel('✅ قبول')
                            .setStyle(
                                ButtonStyle.Success
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                `gang_reject_${inviteId}`
                            )
                            .setLabel('❌ رفض')
                            .setStyle(
                                ButtonStyle.Danger
                            )
                    );

            try {

                await target.send({
                    embeds: [embed],
                    components: [row]
                });

            } catch {

                return interaction.reply({
                    content:
                        '❌ لم أستطع إرسال الرسالة الخاصة للاعب. تأكد أن الرسائل الخاصة مفتوحة لديه.',
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
                        '❌ طرد الأعضاء متاح لزعيم العصابة ونائبه فقط.',
                    ephemeral: true
                });
            }

            const result =
                getUserGang(db, userId);

            const target =
                interaction.options.getUser('user');

            if (!result) {
                return interaction.reply({
                    content: '❌ أنت لست في عصابة.',
                    ephemeral: true
                });
            }

            if (!result.gang.members.includes(target.id)) {
                return interaction.reply({
                    content:
                        '❌ هذا اللاعب ليس في عصابتك.',
                    ephemeral: true
                });
            }

            if (target.id === result.gang.leader) {
                return interaction.reply({
                    content:
                        '❌ لا يمكن طرد زعيم العصابة.',
                    ephemeral: true
                });
            }

            if (
                result.gang.deputy === target.id &&
                !isGangLeader(db, userId)
            ) {
                return interaction.reply({
                    content:
                        '❌ نائب الزعيم لا يستطيع طرد نائب آخر.',
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

            const targetMember =
                await interaction.guild.members
                    .fetch(target.id)
                    .catch(() => null);

            if (targetMember) {
                await removeRole(
                    targetMember,
                    config.roles.gangMember
                );

                await removeRole(
                    targetMember,
                    config.roles.gangDeputy
                );
            }

            saveData(db);

            return interaction.reply(
                `✅ تم طرد ${target} من عصابة **${result.gang.name}**.`
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
                        '❌ الزعيم لا يستطيع مغادرة العصابة. يجب نقل القيادة أو حذف العصابة.',
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

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        `💰 بنك ${result.gang.name}`
                    )
                    .setDescription(
                        `💵 الرصيد الحالي:\n\n` +
                        `**$${formatMoney(result.gang.bank)}**`
                    )
                    .setColor(0x00AA00);

            return interaction.reply({
                embeds: [embed],
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

            const embed =
                new EmbedBuilder()
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

            if (!isPolice(member)) {
                return interaction.reply({
                    content:
                        '❌ هذه المعلومات مخصصة للشرطة.',
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
                    ? deputies
                        .map(m => `<@${m.id}>`)
                        .join('\n')
                    : 'لا يوجد';

            const officerText =
                officers.size
                    ? officers
                        .map(m => `<@${m.id}>`)
                        .join('\n')
                    : 'لا يوجد';

            const embed =
                new EmbedBuilder()
                    .setTitle('🚔 معلومات الشرطة')
                    .addFields(

                        {
                            name: '👑 قائد الشرطة',
                            value:
                                leader
                                    ? `<@${leader.id}>`
                                    : 'غير محدد'
                        },

                        {
                            name: '🥷 نواب الشرطة',
                            value:
                                deputyText
                        },

                        {
                            name: '👮 أعضاء الشرطة',
                            value:
                                officerText
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
                        '❌ دعوات الشرطة متاحة لقائد الشرطة ونائبه فقط.',
                    ephemeral: true
                });
            }

            const target =
                interaction.options.getUser('user');

            if (target.bot) {
                return interaction.reply({
                    content:
                        '❌ لا يمكن دعوة بوت.',
                    ephemeral: true
                });
            }

            const targetMember =
                await interaction.guild.members
                    .fetch(target.id);

            if (isPolice(targetMember)) {
                return interaction.reply({
                    content:
                        '❌ هذا اللاعب موجود أصلًا في الشرطة.',
                    ephemeral: true
                });
            }

            if (isGangMember(db, target.id)) {
                return interaction.reply({
                    content:
                        '❌ لا يمكن دعوة عضو عصابة إلى الشرطة.',
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

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        '📨 دعوة للانضمام إلى الشرطة'
                    )
                    .setDescription(
                        `🚔 **الجهة:** الشرطة\n` +
                        `👤 **العضو المدعو:** ${target}\n` +
                        `👮 **الداعي:** ${interaction.user}\n\n` +
                        `هل تريد الانضمام إلى الشرطة؟`
                    )
                    .setColor(0x0066FF);

            const row =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `police_accept_${inviteId}`
                            )
                            .setLabel('✅ قبول')
                            .setStyle(
                                ButtonStyle.Success
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                `police_reject_${inviteId}`
                            )
                            .setLabel('❌ رفض')
                            .setStyle(
                                ButtonStyle.Danger
                            )
                    );

            try {

                await target.send({
                    embeds: [embed],
                    components: [row]
                });

            } catch {

                return interaction.reply({
                    content:
                        '❌ لم أستطع إرسال الدعوة في الخاص.',
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
                        '❌ طرد أعضاء الشرطة متاح لقائد الشرطة فقط.',
                    ephemeral: true
                });
            }

            const target =
                interaction.options.getUser('user');

            if (target.id === userId) {
                return interaction.reply({
                    content:
                        '❌ لا يمكنك طرد نفسك.',
                    ephemeral: true
                });
            }

            const targetMember =
                await interaction.guild.members
                    .fetch(target.id)
                    .catch(() => null);

            if (!targetMember) {
                return interaction.reply({
                    content:
                        '❌ لم أجد العضو.',
                    ephemeral: true
                });
            }

            if (!isPolice(targetMember)) {
                return interaction.reply({
                    content:
                        '❌ هذا اللاعب ليس من الشرطة.',
                    ephemeral: true
                });
            }

            if (
                hasRole(
                    targetMember,
                    config.roles.policeLeader
                )
            ) {
                return interaction.reply({
                    content:
                        '❌ لا يمكن طرد قائد الشرطة.',
                    ephemeral: true
                });
            }

            await removeRole(
                targetMember,
                config.roles.policeOfficer
            );

            await removeRole(
                targetMember,
                config.roles.policeDeputy
            );

            saveData(db);

            return interaction.reply(
                `✅ تم طرد ${target} من الشرطة.`
            );
        }

        // ==================================================
        // POLICE MISSIONS
        // ==================================================

        if (interaction.commandName === 'policemissions') {

            if (!isPolice(member)) {

                return interaction.reply({
                    content:
                        '❌ هذا الأمر مخصص للشرطة.',
                    ephemeral: true
                });
            }

            if (!db.missions[userId]) {

                db.missions[userId] = {
                    type: 'police',
                    text: '🚔 القبض على مطلوبين',
                    reward: 5000,
                    progress: 0,
                    target: 3,
                    completed: false
                };

                saveData(db);
            }

            const mission =
                db.missions[userId];

            const embed =
                new EmbedBuilder()
                    .setTitle('🏆 مهام الشرطة')
                    .setDescription(
                        `📋 **المهمة:** ${mission.text}\n\n` +
                        `📊 **التقدم:** ${mission.progress}/${mission.target}\n\n` +
                        `💰 **المكافأة:** $${formatMoney(mission.reward)}`
                    )
                    .setColor(0x0066FF);

            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }

        // ==================================================
        // JAIL
        // ==================================================

        if (interaction.commandName === 'jail') {

            if (!isPolice(member)) {

                return interaction.reply({
                    content:
                        '❌ هذا الأمر مخصص للشرطة.',
                    ephemeral: true
                });
            }

            const target =
                interaction.options.getMember('user');

            const minutes =
                interaction.options.getInteger('minutes');

            if (!target) {
                return interaction.reply({
                    content:
                        '❌ لم أجد اللاعب.',
                    ephemeral: true
                });
            }

            if (target.id === userId) {
                return interaction.reply({
                    content:
                        '❌ لا يمكنك سجن نفسك.',
                    ephemeral: true
                });
            }

            if (hasRole(
                target,
                config.roles.owner
            )) {
                return interaction.reply({
                    content:
                        '❌ لا يمكن سجن المالك.',
                    ephemeral: true
                });
            }

            if (db.jail[target.id]) {
                return interaction.reply({
                    content:
                        '❌ اللاعب مسجون بالفعل.',
                    ephemeral: true
                });
            }

            const originalRoles =
                target.roles.cache
                    .filter(
                        role =>
                            role.id !== interaction.guild.id &&
                            role.id !== config.roles.prisoner
                    )
                    .map(role => role.id);

            db.jail[target.id] = {
                endsAt:
                    Date.now() +
                    minutes * 60 * 1000,

                originalRoles:
                    originalRoles,

                jailedBy:
                    userId
            };

            await target.roles.set([
                config.roles.prisoner
            ]);

            saveData(db);

            return interaction.reply(
                `⛓️ تم سجن ${target} لمدة **${minutes} دقيقة**.\n` +
                `🔒 تم حفظ رتبته الأصلية وسيتم إرجاعها تلقائيًا.`
            );
        }

        // ==================================================
        // UNJAIL
        // ==================================================

        if (interaction.commandName === 'unjail') {

            if (!isPolice(member)) {

                return interaction.reply({
                    content:
                        '❌ هذا الأمر مخصص للشرطة.',
                    ephemeral: true
                });
            }

            const target =
                interaction.options.getMember('user');

            if (
                !target ||
                !db.jail[target.id]
            ) {
                return interaction.reply({
                    content:
                        '❌ اللاعب غير مسجون.',
                    ephemeral: true
                });
            }

            const jailData =
                db.jail[target.id];

            const validRoles =
                jailData.originalRoles
                    .filter(
                        roleId =>
                            interaction.guild.roles.cache.has(
                                roleId
                            )
                    );

            await target.roles.set(validRoles);

            delete db.jail[target.id];

            saveData(db);

            return interaction.reply(
                `✅ تم فك سجن ${target} وإرجاع رتبته الأصلية.`
            );
        }

        // ==================================================
        // WANTED
        // ==================================================

        if (interaction.commandName === 'wanted') {

            if (!isPolice(member)) {

                return interaction.reply({
                    content:
                        '❌ هذا الأمر مخصص للشرطة.',
                    ephemeral: true
                });
            }

            const target =
                interaction.options.getUser('user');

            const reason =
                interaction.options.getString('reason');

            ensureUser(db, target.id);

            db.users[target.id].wanted = true;
            db.users[target.id].wantedReason = reason;

            saveData(db);

            return interaction.reply(
                `🚨 تم جعل ${target} مطلوبًا.\n` +
                `📋 **السبب:** ${reason}`
            );
        }

        // ==================================================
        // UNWANTED
        // ==================================================

        if (interaction.commandName === 'unwanted') {

            if (!isPolice(member)) {

                return interaction.reply({
                    content:
                        '❌ هذا الأمر مخصص للشرطة.',
                    ephemeral: true
                });
            }

            const target =
                interaction.options.getUser('user');

            ensureUser(db, target.id);

            db.users[target.id].wanted = false;
            db.users[target.id].wantedReason = null;

            saveData(db);

            return interaction.reply(
                `✅ تم إزالة ${target} من قائمة المطلوبين.`
            );
        }

        // ==================================================
        // ARREST
        // ==================================================

        if (interaction.commandName === 'arrest') {

            if (!isPolice(member)) {

                return interaction.reply({
                    content:
                        '❌ هذا الأمر مخصص للشرطة.',
                    ephemeral: true
                });
            }

            const target =
                interaction.options.getUser('user');

            ensureUser(db, target.id);

            if (!db.users[target.id].wanted) {

                return interaction.reply({
                    content:
                        '❌ هذا اللاعب ليس مطلوبًا.',
                    ephemeral: true
                });
            }

            db.users[target.id].wanted = false;
            db.users[target.id].wantedReason = null;

            if (db.missions[userId]) {

                const mission =
                    db.missions[userId];

                if (
                    mission.type === 'police' &&
                    !mission.completed
                ) {

                    mission.progress++;

                    if (
                        mission.progress >=
                        mission.target
                    ) {

                        mission.progress =
                            mission.target;

                        mission.completed =
                            true;

                        ensureUser(
                            db,
                            userId
                        );

                        db.users[userId].balance +=
                            mission.reward;
                    }
                }
            }

            saveData(db);

            return interaction.reply(
                `🚔 تم القبض على ${target} بنجاح.`
            );
        }

        // ==================================================
        // REPORT
        // ==================================================

        if (interaction.commandName === 'report') {

            const text =
                interaction.options.getString('text');

            const reportId =
                `report_${Date.now()}_${userId}`;

            db.reports[reportId] = {
                id: reportId,
                userId: userId,
                text: text,
                status: 'open',
                createdAt: Date.now()
            };

            saveData(db);

            return interaction.reply({
                content:
                    `🚨 تم إرسال بلاغك بنجاح.\n` +
                    `🆔 رقم البلاغ: \`${reportId}\``,
                ephemeral: true
            });
        }

        // ==================================================
        // ROB
        // ==================================================

        if (interaction.commandName === 'rob') {

            if (!isGangMember(db, userId)) {

                return interaction.reply({
                    content:
                        '❌ عمليات السرقة متاحة لأعضاء العصابات فقط.',
                    ephemeral: true
                });
            }

            const embed =
                new EmbedBuilder()
                    .setTitle('🔫 عمليات العصابة')
                    .setDescription(
                        `اختر العملية التي تريد تنفيذها:\n\n` +
                        `🏪 **سرقة متجر**\n` +
                        `🏦 **سرقة بنك**\n` +
                        `🌿 **عملية حشيش**\n\n` +
                        `⚠️ كل عملية لديها نسبة نجاح أو خسارة.`
                    )
                    .setColor(0xFF0000);

            const row =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                `rob_store_${userId}`
                            )
                            .setLabel(
                                '🏪 سرقة متجر'
                            )
                            .setStyle(
                                ButtonStyle.Danger
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                `rob_bank_${userId}`
                            )
                            .setLabel(
                                '🏦 سرقة بنك'
                            )
                            .setStyle(
                                ButtonStyle.Danger
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                `rob_drugs_${userId}`
                            )
                            .setLabel(
                                '🌿 عملية حشيش'
                            )
                            .setStyle(
                                ButtonStyle.Success
                            )
                    );

            return interaction.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true
            });
        }

        // ==================================================
        // WAR
        // ==================================================

        if (interaction.commandName === 'war') {

            const gangResult =
                getUserGang(db, userId);

            const policeUser =
                isPolice(member);

            if (!policeUser && !gangResult) {

                return interaction.reply({
                    content:
                        '❌ الحرب متاحة للشرطة والعصابات فقط.',
                    ephemeral: true
                });
            }

            // الشرطة تختار عصابة
            if (policeUser) {

                const gangs =
                    Object.entries(db.gangs);

                if (!gangs.length) {
                    return inter
