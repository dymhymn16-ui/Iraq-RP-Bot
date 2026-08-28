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
// أدوات مساعدة
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
            wantedReason: null,
            policeMissionProgress: 0,
            gangMissionProgress: 0
        };
    }

    return db.users[userId];
}

function hasRole(member, roleId) {
    return member.roles.cache.has(roleId);
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

function getGang(db, gangId) {
    return db.gangs[gangId] || null;
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

function isGangMember(db, userId) {
    return !!getUserGang(db, userId);
}

function formatMoney(number) {
    return Number(number || 0).toLocaleString();
}

async function addRole(member, roleId) {
    if (!member.roles.cache.has(roleId)) {
        await member.roles.add(roleId);
    }
}

async function removeRole(member, roleId) {
    if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
    }
}

// ======================================================
// أوامر البوت
// ======================================================

const commands = [

    // الاقتصاد
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

    // العصابات
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
        .setName('leavegang')
        .setDescription('مغادرة العصابة'),

    new SlashCommandBuilder()
        .setName('gangbank')
        .setDescription('عرض بنك العصابة'),

    new SlashCommandBuilder()
        .setName('gangstorage')
        .setDescription('عرض مخزن العصابة'),

    // الشرطة
    new SlashCommandBuilder()
        .setName('policeinfo')
        .setDescription('عرض معلومات الشرطة'),

    new SlashCommandBuilder()
        .setName('policeinvite')
        .setDescription('دعوة لاعب إلى الشرطة')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('اللاعب المدعو')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('policemissions')
        .setDescription('عرض مهام الشرطة'),

    // السجن
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

    // المطلوبين والبلاغات
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

    // السرقة
    new SlashCommandBuilder()
        .setName('rob')
        .setDescription('تنفيذ عملية سرقة'),

    // الحرب
    new SlashCommandBuilder()
        .setName('war')
        .setDescription('بدء حرب بين الشرطة والعصابة'),

    // المهام
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

    try {

        if (!interaction.isChatInputCommand()) return;

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
                `✅ تمت إضافة **$${formatMoney(amount)}** إلى ${target}.`
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
                Math.max(0, db.users[target.id].balance - amount);

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
                    content: '❌ إنشاء العصابات متاح للإدارة فقط.',
                    ephemeral: true
                });
            }

            if (isGangMember(db, userId)) {

                return interaction.reply({
                    content: '❌ أنت موجود أصلًا في عصابة.',
                    ephemeral: true
                });
            }

            const name = interaction.options.getString('name');

            const gangId = `${Date.now()}_${userId}`;

            db.gangs[gangId] = {
                id: gangId,
                name,
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

            await addRole(member, config.roles.gangLeader);

            saveData(db);

            const embed = new EmbedBuilder()
                .setTitle('🔫 تم إنشاء العصابة')
                .setDescription(
                    `🏴 اسم العصابة: **${name}**\n\n` +
                    `👑 الزعيم: ${interaction.user}\n` +
                    `👥 الأعضاء: 1\n` +
                    `💰 البنك: $0`
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

            const result = getUserGang(db, userId);

            if (!result) {

                return interaction.reply({
                    content: '❌ أنت لست عضوًا في أي عصابة.',
                    ephemeral: true
                });
            }

            const gang = result.gang;

            const memberList = gang.members.length
                ? gang.members.map(id => `<@${id}>`).join('\n')
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
                        value: `$${formatMoney(gang.bank)}`,
                        inline: true
                    },
                    {
                        name: '🌿 الحشيش',
                        value: `${gang.storage.weed} كغ`,
                        inline: true
                    },
                    {
                        name: '📦 المسروقات',
                        value: `${gang.storage.stolen}`,
                        inline: true
                    },
                    {
                        name: '🔫 الأسلحة',
                        value: `${gang.storage.weapons}`,
                        inline: true
                    },
                    {
                        name: '⚔️ الانتصارات',
                        value: `${gang.wins}`,
                        inline: true
                    },
                    {
                        name: '💀 الخسائر',
                        value: `${gang.losses}`,
                        inline: true
                    },
                    {
                        name: '👥 أعضاء العصابة',
                        value: memberList
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
                    content: '❌ دعوات العصابة متاحة للزعيم ونائب الزعيم فقط.',
                    ephemeral: true
                });
            }

            const result = getUserGang(db, userId);
            const target = interaction.options.getUser('user');

            if (target.bot) {

                return interaction.reply({
                    content: '❌ لا يمكن دعوة بوت.',
                    ephemeral: true
                });
            }

            if (isGangMember(db, target.id)) {

                return interaction.reply({
                    content: '❌ هذا اللاعب موجود أصلًا في عصابة.',
                    ephemeral: true
                });
            }

            const inviteId = `gang_${Date.now()}_${userId}_${target.id}`;

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
                    `🔫 العصابة: **${result.gang.name}**\n` +
                    `👤 العضو المدعو: ${target}\n` +
                    `👑 الداعي: ${interaction.user}\n\n` +
                    `هل تريد الانضمام إلى العصابة؟`
                )
                .setColor(0x8B0000);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`gang_accept_${inviteId}`)
                        .setLabel('✅ قبول')
                        .setStyle(ButtonStyle.Success),

                    new ButtonBuilder()
                        .setCustomId(`gang_reject_${inviteId}`)
                        .setLabel('❌ رفض')
                        .setStyle(ButtonStyle.Danger)
                );

            await target.send({
                embeds: [embed],
                components: [row]
            }).catch(() => {});

            return interaction.reply({
                content: `✅ تم إرسال دعوة إلى ${target}.`,
                ephemeral: true
            });
        }

        // ==================================================
        // LEAVE GANG
        // ==================================================

        if (interaction.commandName === 'leavegang') {

            const result = getUserGang(db, userId);

            if (!result) {

                return interaction.reply({
                    content: '❌ أنت لست عضوًا في عصابة.',
                    ephemeral: true
                });
            }

            if (result.gang.leader === userId) {

                return interaction.reply({
                    content:
                        '❌ أنت زعيم العصابة. لا يمكنك المغادرة قبل تسليم القيادة أو حذف العصابة.',
                    ephemeral: true
                });
            }

            result.gang.members =
                result.gang.members.filter(id => id !== userId);

            if (result.gang.deputy === userId) {
                result.gang.deputy = null;
            }

            await removeRole(member, config.roles.gangMember);
            await removeRole(member, config.roles.gangDeputy);

            saveData(db);

            return interaction.reply(
                '✅ غادرت العصابة بنجاح.'
            );
        }

        // ==================================================
        // GANG BANK
        // ==================================================

        if (interaction.commandName === 'gangbank') {

            const result = getUserGang(db, userId);

            if (!result) {

                return interaction.reply({
                    content: '❌ أنت لست عضوًا في عصابة.',
                    ephemeral: true
                });
            }

            return interaction.reply({
                content:
                    `💰 **بنك العصابة ${result.gang.name}**\n\n` +
                    `💵 الرصيد: **$${formatMoney(result.gang.bank)}**`,
                ephemeral: true
            });
        }

        // ==================================================
        // GANG STORAGE
        // ==================================================

        if (interaction.commandName === 'gangstorage') {

            const result = getUserGang(db, userId);

            if (!result) {

                return interaction.reply({
                    content: '❌ أنت لست عضوًا في عصابة.',
                    ephemeral: true
                });
            }

            const storage = result.gang.storage;

            const embed = new EmbedBuilder()
                .setTitle(`🌿 مخزن ${result.gang.name}`)
                .addFields(
                    {
                        name: '🌿 الحشيش',
                        value: `${storage.weed} كغ`,
                        inline: true
                    },
                    {
                        name: '📦 المسروقات',
                        value: `${storage.stolen}`,
                        inline: true
                    },
                    {
                        name: '🔫 الأسلحة',
                        value: `${storage.weapons}`,
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
                    content: '❌ هذه المعلومات مخصصة للشرطة.',
                    ephemeral: true
                });
            }

            const guildMembers = await interaction.guild.members.fetch();

            const leader = guildMembers.find(m =>
                hasRole(m, config.roles.policeLeader)
            );

            const deputies = guildMembers.filter(m =>
                hasRole(m, config.roles.policeDeputy)
            );

            const officers = guildMembers.filter(m =>
                hasRole(m, config.roles.policeOfficer)
            );

            const deputyText = deputies.size
                ? deputies.map(m => `<@${m.id}>`).join('\n')
                : 'لا يوجد';

            const officerText = officers.size
                ? officers.map(m => `<@${m.id}>`).join('\n')
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
                        '❌ دعوات الشرطة متاحة لقائد الشرطة ونائبه فقط.',
                    ephemeral: true
                });
            }

            const target = interaction.options.getUser('user');

            if (isPolice(
                await interaction.guild.members.fetch(target.id)
            )) {

                return interaction.reply({
                    content: '❌ هذا اللاعب موجود أصلًا في الشرطة.',
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
                    `🚔 الجهة: **الشرطة**\n` +
                    `👤 العضو المدعو: ${target}\n` +
                    `👮 الداعي: ${interaction.user}\n\n` +
                    `هل تريد الانضمام إلى الشرطة؟`
                )
                .setColor(0x0066FF);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`police_accept_${inviteId}`)
                        .setLabel('✅ قبول')
                        .setStyle(ButtonStyle.Success),

                    new ButtonBuilder()
                        .setCustomId(`police_reject_${inviteId}`)
                        .setLabel('❌ رفض')
                        .setStyle(ButtonStyle.Danger)
                );

            await target.send({
                embeds: [embed],
                components: [row]
            }).catch(() => {});

            return interaction.reply({
                content: `✅ تم إرسال دعوة الشرطة إلى ${target}.`,
                ephemeral: true
            });
        }

        // ==================================================
        // POLICE MISSIONS
        // ==================================================

        if (interaction.commandName === 'policemissions') {

            if (!isPolice(member) && !isOwner(member)) {

                return interaction.reply({
                    content: '❌ هذا الأمر مخصص للشرطة.',
                    ephemeral: true
                });
            }

            const mission =
                db.missions[userId] || {
                    type: 'police',
                    text: '🚔 القبض على مطلوب',
                    reward: 5000,
                    progress: 0,
                    target: 3
                };

            db.missions[userId] = mission;

            saveData(db);

            const embed = new EmbedBuilder()
                .setTitle('🏆 مهام الشرطة')
                .setDescription(
                    `📋 المهمة: **${mission.text}**\n\n` +
                    `📊 التقدم: **${mission.progress}/${mission.target}**\n` +
                    `💰 المكافأة: **$${formatMoney(mission.reward)}**`
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

            if (!isPolice(member) && !isOwner(member)) {

                return interaction.reply({
                    content: '❌ هذا الأمر مخصص للشرطة.',
                    ephemeral: true
                });
            }

            const target =
                interaction.options.getMember('user');

            const minutes =
                interaction.options.getInteger('minutes');

            if (!target) {

                return interaction.reply({
                    content: '❌ لم أجد اللاعب.',
                    ephemeral: true
                });
            }

            const originalRoles =
                target.roles.cache
                    .filter(role => role.id !== interaction.guild.id)
                    .map(role => role.id);

            db.jail[target.id] = {
                endsAt: Date.now() + minutes * 60 * 1000,
                originalRoles
            };

            await target.roles.set([
                config.roles.prisoner
            ]);

            saveData(db);

            return interaction.reply(
                `⛓️ تم سجن ${target} لمدة **${minutes} دقيقة**.`
            );
        }

        // ==================================================
        // UNJAIL
        // ==================================================

        if (interaction.commandName === 'unjail') {

            if (!isPolice(member) && !isOwner(member)) {

                return interaction.reply({
                    content: '❌ هذا الأمر مخصص للشرطة.',
                    ephemeral: true
                });
            }

            const target =
                interaction.options.getMember('user');

            if (!target || !db.jail[target.id]) {

                return interaction.reply({
                    content: '❌ اللاعب غير مسجون.',
                    ephemeral: true
                });
            }

            await target.roles.set(
                db.jail[target.id].originalRoles
            );

            delete db.jail[target.id];

            saveData(db);

            return interaction.reply(
                `✅ تم فك سجن ${target} وإرجاع رتبته.`
            );
        }

        // ==================================================
        // WANTED
        // ==================================================

        if (interaction.commandName === 'wanted') {

            if (!isPolice(member) && !isOwner(member)) {

                return interaction.reply({
                    content: '❌ هذا الأمر مخصص للشرطة.',
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
                `🚨 تم جعل ${target} مطلوبًا.\n📋 السبب: **${reason}**`
            );
        }

        // ==================================================
        // UNWANTED
        // ==================================================

        if (interaction.commandName === 'unwanted') {

            if (!isPolice(member) && !isOwner(member)) {

                return interaction.reply({
                    content: '❌ هذا الأمر مخصص للشرطة.',
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

            if (!isPolice(member) && !isOwner(member)) {

                return interaction.reply({
                    content: '❌ هذا الأمر مخصص للشرطة.',
                    ephemeral: true
                });
            }

            const target =
                interaction.options.getUser('user');

            ensureUser(db, target.id);

            if (!db.users[target.id].wanted) {

                return interaction.reply({
                    content: '❌ هذا اللاعب ليس مطلوبًا.',
                    ephemeral: true
                });
            }

            db.users[target.id].wanted = false;
            db.users[target.id].wantedReason = null;

            if (db.missions[userId]) {
                db.missions[userId].progress++;
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
                userId,
                text,
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

            const result = getUserGang(db, userId);

            const embed = new EmbedBuilder()
                .setTitle('🔫 عمليات العصابة')
                .setDescription(
                    'اختر نوع العملية التي تريد تنفيذها:'
                )
                .setColor(0xFF0000);

            const row = new ActionRowBuilder()
                .addComponents(

                    new ButtonBuilder()
                        .setCustomId(`rob_store_${userId}`)
                        .setLabel('🏪 سرقة متجر')
                        .setStyle(ButtonStyle.Danger),

                    new ButtonBuilder()
                        .setCustomId(`rob_bank_${userId}`)
                        .setLabel('🏦 سرقة بنك')
                        .setStyle(ButtonStyle.Danger),

                    new ButtonBuilder()
                        .setCustomId(`rob_drugs_${userId}`)
                        .setLabel('🌿 عملية حشيش')
                        .setStyle(ButtonStyle.Success)
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

            const gangResult = getUserGang(db, userId);

            if (!isPolice(member) && !gangResult) {

                return interaction.reply({
                    content:
                        '❌ الحرب متاحة للشرطة والعصابات فقط.',
                    ephemeral: true
                });
            }

            const gangs =
                Object.entries(db.gangs);

            if (!gangs.length) {

                return interaction.reply({
                    content: '❌ لا توجد عصابات حاليًا.',
                    ephemeral: true
                });
            }

            const targetGang =
                gangs.find(([id, gang]) =>
                    !gangResult || id !== gangResult.id
                );

            if (!targetGang) {

                return interaction.reply({
                    content: '❌ لا توجد عصابة أخرى للحرب.',
                    ephemeral: true
                });
            }

            const warId =
                `war_${Date.now()}_${userId}`;

            db.wars[warId] = {
                id: warId,
                attacker:
                    isPolice(member)
                        ? 'police'
                        : gangResult.id,
                target: targetGang[0],
                status: 'pending',
                createdAt: Date.now()
            };

            saveData(db);

            const embed = new EmbedBuilder()
                .setTitle('⚔️ طلب حرب')
                .setDescription(
                    `🚔/🔫 تم إرسال طلب حرب.\n\n` +
                    `🎯 الهدف: **${targetGang[1].name}**\n\n` +
                    `هل تريدون قبول الحرب؟`
                )
                .setColor(0xFF0000);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`war_accept_${warId}`)
                        .setLabel('⚔️ قبول الحرب')
                        .setStyle(ButtonStyle.Danger),

                    new ButtonBuilder()
                        .setCustomId(`war_reject_${warId}`)
                        .setLabel('❌ رفض')
                        .setStyle(ButtonStyle.Secondary)
                );

            return interaction.reply({
                embeds: [embed],
                components: [row]
            });
        }

        // ==================================================
        // MISSION
        // ==================================================

        if (interaction.commandName === 'mission') {

            const user = ensureUser(db, userId);

            const mission =
                db.missions[userId] || {
                    type: isPolice(member)
                        ? 'police'
                        : 'gang',
                    text: isPolice(member)
                        ? '🚔 القبض على مطلوب'
                        : '🔫 تنفيذ عملية سرقة',
                    reward: 5000,
                    progress: 0,
                    target: 3
                };

            db.missions[userId] = mission;

            saveData(db);

            const embed = new EmbedBuilder()
                .setTitle('🏆 مهمتك')
                .setDescription(
                    `📋 المهمة: **${mission.text}**\n\n` +
                    `📊 التقدم: **${mission.progress}/${mission.target}**\n` +
                    `💰 المكافأة: **$${formatMoney(mission.reward)}**`
                )
                .setColor(0xFFD700);

            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }

    } catch (error) {

        console.error(error);

        if (!interaction.replied && !interaction.deferred) {

            await interaction.reply({
                content:
                    '❌ حدث خطأ داخل البوت. راجع Console لمعرفة السبب.',
                ephemeral: true
            });
        }
    }
});

// ======================================================
// الأزرار
// ======================================================

client.on('interactionCreate', async interaction => {

    if (!interaction.isButton()) return;

    try {

        const db = ensureDatabase(getData());

        // ==================================================
        // دعوات العصابة
        // ==================================================

        if (interaction.customId.startsWith('gang_accept_')) {

            const inviteId =
                interaction.customId.replace('gang_accept_', '');

            const invite = db.invites[inviteId];

            if (!invite) {

                return interaction.reply({
                    content: '❌ هذه الدعوة انتهت أو غير موجودة.',
                    ephemeral: true
                });
            }

            if (invite.to !== interaction.user.id) {

                return interaction.reply({
                    content: '❌ هذه الدعوة ليست مخصصة لك.',
                    ephemeral: true
                });
            }

            const gang = db.gangs[invite.gangId];

            if (!gang) {

                return interaction.reply({
                    content: '❌ العصابة لم تعد موجودة.',
                    ephemeral: true
                });
            }

            if (getUserGang(db, interaction.user.id)) {

                return interaction.reply({
                    content: '❌ أنت عضو في عصابة بالفعل.',
                    ephemeral: true
                });
            }

            gang.members.push(interaction.user.id);

            ensureUser(db, interaction.user.id);

            delete db.invites[inviteId];

            const member =
                await interaction.guild.members.fetch(
                    interaction.user.id
                );

            await addRole(
                member,
                config.roles.gangMember
            );

            saveData(db);

            return interaction.update({
                content:
                    `✅ تم قبول الدعوة والانضمام إلى عصابة **${gang.name}**.\n` +
                    `🔫 تم إعطاؤك رتبة عضو العصابة.`,
                embeds: [],
                components: []
            });
        }

        if (interaction.customId.startsWith('gang_reject_')) {

            const inviteId =
                interaction.customId.replace('gang_reject_', '');

            const invite = db.invites[inviteId];

            if (!invite) {

                return interaction.reply({
                    content: '❌ الدعوة غير موجودة.',
                    ephemeral: true
                });
            }

            if (invite.to !== interaction.user.id) {

                return interaction.reply({
                    content: '❌ هذه الدعوة ليست لك.',
                    ephemeral: true
                });
            }

            delete db.invites[inviteId];

            saveData(db);

            return interaction.update({
                content: '❌ تم رفض دعوة العصابة.',
                embeds: [],
                components: []
            });
        }

        // ==================================================
        // دعوات الشرطة
        // ==================================================

        if (interaction.customId.startsWith('police_accept_')) {

            const inviteId =
                interaction.customId.replace('police_accept_', '');

            const invite = db.invites[inviteId];

            if (!invite) {

                return interaction.reply({
                    content: '❌ الدعوة انتهت.',
                    ephemeral: true
                });
            }

            if (invite.to !== interaction.user.id) {

                return interaction.reply({
                    content: '❌ هذه الدعوة ليست مخصصة لك.',
                    ephemeral: true
                });
            }

            const member =
                await interaction.guild.members.fetch(
                    interaction.user.id
                );

            await addRole(
                member,
                config.roles.policeOfficer
            );

            delete db.invites[inviteId];

            saveData(db);

            return interaction.update({
                content:
                    '✅ تم قبول الدعوة والانضمام إلى الشرطة.\n' +
                    '🚔 تم إعطاؤك رتبة الشرطي.',
                embeds: [],
                components: []
            });
        }

        if (interaction.customId.startsWith('police_reject_')) {

            const inviteId =
                interaction.customId.replace('police_reject_', '');

            const invite = db.invites[inviteId];

            if (!invite) {

                return interaction.reply({
                    content: '❌ الدعوة غير موجودة.',
                    ephemeral: true
                });
            }

            if (invite.to !== interaction.user.id) {

                return interaction.reply({
                    content: '❌ هذه الدعوة ليست لك.',
                    ephemeral: true
                });
            }

            delete db.invites[inviteId];

            saveData(db);

            return interaction.update({
                content: '❌ تم رفض دعوة الشرطة.',
                embeds: [],
                components: []
            });
        }

        // ==================================================
        // السرقة
        // ==================================================

        if (interaction.customId.startsWith('rob_')) {

            const parts =
                interaction.customId.split('_');

            const type = parts[1];
            const ownerId = parts[2];

            if (interaction.user.id !== ownerId) {

                return interaction.reply({
                    content: '❌ هذا الزر ليس مخصصًا لك.',
                    ephemeral: true
                });
            }

            const result =
                getUserGang(db, interaction.user.id);

            if (!result) {

                return interaction.reply({
                    content: '❌ أنت لست عضوًا في عصابة.',
                    ephemeral: true
                });
            }

            let reward = 0;

            if (type === 'store') {

                reward =
                    Math.floor(Math.random() * 5000) + 2000;

                result.gang.bank += reward;
                result.gang.storage.stolen += 1;
            }

            if (type === 'bank') {

                reward =
                    Math.floor(Math.random() * 20000) + 10000;

                result.gang.bank += reward;
                result.gang.storage.stolen += 5;
            }

            if (type === 'drugs') {

                const weed =
                    Math.floor(Math.random() * 10) + 5;

                result.gang.storage.weed += weed;

                saveData(db);

                return interaction.update({
                    content:
                        `🌿 تمت العملية بنجاح!\n` +
                        `📦 تمت إضافة **${weed} كغ** حشيش إلى مخزن العصابة.`,
                    embeds: [],
                    components: []
                });
            }

            saveData(db);

            return interaction.update({
                content:
                    `✅ تمت العملية بنجاح!\n` +
                    `💰 دخل إلى بنك العصابة: **$${formatMoney(reward)}**\n` +
                    `📦 تمت إضافة المسروقات إلى المخزن.`,
                embeds: [],
                components: []
            });
        }

        // ==================================================
        // الحرب
        // ==================================================

        if (interaction.customId.startsWith('war_accept_')) {

            const warId =
                interaction.customId.replace('war_accept_', '');

            const war = db.wars[warId];

            if (!war) {

                return interaction.reply({
                    content: '❌ الحرب غير موجودة.',
                    ephemeral: true
                });
            }

            if (war.status !== 'pending') {

                return interaction.reply({
                    content: '❌ هذه الحرب انتهت أو تم التعامل معها.',
                    ephemeral: true
                });
            }

            const targetGang =
                db.gangs[war.target];

            if (!targetGang) {

                return interaction.reply({
                    content: '❌ العصابة المستهدفة غير موجودة.',
                    ephemeral: true
                });
            }

            const member = interaction.member;

            const allowed =
                war.attacker === 'police'
                    ? isGangDeputy(db, interaction.user.id)
                    : isPoliceDeputy(member);

            if (!allowed) {

                return interaction.reply({
                    content:
                        '❌ لا تملك صلاحية قبول هذه الحرب.',
                    ephemeral: true
                });
            }

            war.status = 'active';
            war.startedAt = Date.now();

            saveData(db);

            return interaction.update({
                content:
                    `⚔️ بدأت الحرب رسميًا!\n` +
                    `🎯 الطرف المستهدف: **${targetGang.name}**`,
                embeds: [],
                components: []
            });
        }

        if (interaction.customId.startsWith('war_reject_')) {

            const warId =
                interaction.customId.replace('war_reject_', '');

            const war = db.wars[warId];

            if (!war) {

                return interaction.reply({
                    content: '❌ الحرب غير موجودة.',
                    ephemeral: true
                });
            }

            delete db.wars[warId];

            saveData(db);

            return interaction.update({
                content: '❌ تم رفض طلب الحرب.',
                embeds: [],
                components: []
            });
        }

    } catch (error) {

        console.error('Button Error:', error);

        if (!interaction.replied) {

            await interaction.reply({
                content: '❌ حدث خطأ أثناء تنفيذ العملية.',
                ephemeral: true
            }).catch(() => {});
        }
    }
});

// ======================================================
// انتهاء السجن تلقائيًا
// ======================================================

setInterval(async () => {

    try {

        const db = ensureDatabase(getData());

        for (const [userId, jail] of Object.entries(db.jail)) {

         
