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

// ==================== رواتب الشرطة ====================

const policeSalaries = {
    policeLeader: 10000,   // قائد الشرطة
    policeDeputy: 7500,    // نائب قائد الشرطة
    policeOfficer: 5000    // ضابط الشرطة
};

// كل ساعة
const SALARY_INTERVAL = 60 * 60 * 1000;

// ==================== الأوامر ====================

const commands = [

    new SlashCommandBuilder()
        .setName('balance')
        .setDescription('عرض رصيدك'),

    new SlashCommandBuilder()
        .setName('gang')
        .setDescription('عرض معلومات عصابتك'),

    new SlashCommandBuilder()
        .setName('rob')
        .setDescription('تنفيذ عملية سرقة'),

    new SlashCommandBuilder()
        .setName('jail')
        .setDescription('سجن لاعب')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('اللاعب المراد سجنه')
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
                .setDescription('اللاعب المراد فك سجنه')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('wanted')
        .setDescription('إضافة لاعب إلى المطلوبين')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('اللاعب المطلوب')
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
        )

].map(command => command.toJSON());

// ==================== التحقق من الرتب ====================

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

function isGang(member) {
    return (
        hasRole(member, config.roles.gangLeader) ||
        hasRole(member, config.roles.gangDeputy) ||
        hasRole(member, config.roles.gangMember)
    );
}

// ==================== تشغيل البوت ====================

client.once('ready', async () => {

    console.log(`✅ تم تشغيل البوت: ${client.user.tag}`);

    const rest = new REST({ version: '10' })
        .setToken(process.env.TOKEN);

    try {

        await rest.put(
            Routes.applicationCommands(client.user.id),
            {
                body: commands
            }
        );

        console.log('✅ تم تسجيل أوامر Slash بنجاح');

    } catch (error) {

        console.error('❌ خطأ في تسجيل الأوامر:', error);

    }
});

// ==================== الأوامر ====================

client.on('interactionCreate', async interaction => {

    try {

        if (!interaction.isChatInputCommand()) return;

        const db = getData();

        if (!db.users) db.users = {};
        if (!db.gangs) db.gangs = {};
        if (!db.jail) db.jail = {};

        const member = interaction.member;
        const userId = interaction.user.id;

        // إنشاء بيانات اللاعب إذا لم تكن موجودة
        if (!db.users[userId]) {

            db.users[userId] = {
                balance: 0,
                originalRoles: [],
                wanted: false,
                wantedReason: null
            };

            saveData(db);
        }

        // ================= BALANCE =================

        if (interaction.commandName === 'balance') {

            const balance = db.users[userId].balance || 0;

            const embed = new EmbedBuilder()
                .setTitle('💰 رصيدك')
                .setDescription(
                    `رصيدك الحالي:\n\n💵 **${balance.toLocaleString()} ${config.currencyName}**`
                )
                .setColor(0x00FF00);

            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }

        // ================= GANG =================

        if (interaction.commandName === 'gang') {

            if (!isGang(member)) {

                return interaction.reply({
                    content: '❌ أنت لست عضوًا في عصابة.',
                    ephemeral: true
                });
            }

            const gang = db.gangs[userId] || {
                name: 'العصابة',
                bank: 0,
                weed: 0,
                stolen: 0,
                members: []
            };

            const embed = new EmbedBuilder()
                .setTitle('🔫 معلومات العصابة')
                .addFields(
                    {
                        name: '👑 قائد العصابة',
                        value: 'غير محدد',
                        inline: true
                    },
                    {
                        name: '👥 الأعضاء',
                        value: `${gang.members?.length || 0}`,
                        inline: true
                    },
                    {
                        name: '💰 بنك العصابة',
                        value: `$${(gang.bank || 0).toLocaleString()}`,
                        inline: true
                    },
                    {
                        name: '🌿 الحشيش',
                        value: `${gang.weed || 0} كغ`,
                        inline: true
                    },
                    {
                        name: '📦 المسروقات',
                        value: `${gang.stolen || 0}`,
                        inline: true
                    }
                )
                .setColor(0x8B0000);

            return interaction.reply({
                embeds: [embed]
            });
        }

        // ================= ROB =================

        if (interaction.commandName === 'rob') {

            if (!isGang(member)) {

                return interaction.reply({
                    content: '❌ هذا الأمر مخصص لأعضاء العصابات فقط.',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('🔫 عمليات السرقة')
                .setDescription(
                    'اختر العملية التي تريد تنفيذها من الأزرار الموجودة بالأسفل.'
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
                        .setStyle(ButtonStyle.Danger)

                );

            return interaction.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true
            });
        }

        // ================= JAIL =================

        if (interaction.commandName === 'jail') {

            if (!isPolice(member) && !isOwner(member)) {

                return interaction.reply({
                    content: '❌ هذا الأمر مخصص للشرطة فقط.',
                    ephemeral: true
                });
            }

            const target = interaction.options.getMember('user');
            const minutes = interaction.options.getInteger('minutes');

            if (!target) {

                return interaction.reply({
                    content: '❌ لم أستطع العثور على هذا العضو.',
                    ephemeral: true
                });
            }

            const targetId = target.id;

            db.jail[targetId] = {
                endsAt: Date.now() + (minutes * 60 * 1000),
                originalRoles: target.roles.cache
                    .filter(role => role.id !== interaction.guild.id)
                    .map(role => role.id)
            };

            await target.roles.set([config.roles.prisoner]);

            saveData(db);

            const embed = new EmbedBuilder()
                .setTitle('⛓️ تم السجن')
                .setDescription(
                    `👤 اللاعب: ${target}\n` +
                    `⏱️ المدة: **${minutes} دقيقة**`
                )
                .setColor(0x000000);

            return interaction.reply({
                embeds: [embed]
            });
        }

        // ================= UNJAIL =================

        if (interaction.commandName === 'unjail') {

            if (!isPolice(member) && !isOwner(member)) {

                return interaction.reply({
                    content: '❌ هذا الأمر مخصص للشرطة فقط.',
                    ephemeral: true
                });
            }

            const target = interaction.options.getMember('user');

            if (!target) {

                return interaction.reply({
                    content: '❌ العضو غير موجود.',
                    ephemeral: true
                });
            }

            const jailData = db.jail[target.id];

            if (!jailData) {

                return interaction.reply({
                    content: '❌ هذا اللاعب ليس مسجونًا.',
                    ephemeral: true
                });
            }

            await target.roles.set(jailData.originalRoles);

            delete db.jail[target.id];

            saveData(db);

            return interaction.reply({
                content: `✅ تم فك سجن ${target} وإرجاع رتبته الأصلية.`
            });
        }

        // ================= WANTED =================

        if (interaction.commandName === 'wanted') {

            if (!isPolice(member) && !isOwner(member)) {

                return interaction.reply({
                    content: '❌ هذا الأمر مخصص للشرطة فقط.',
                    ephemeral: true
                });
            }

            const target = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');

            if (!db.users[target.id]) {

                db.users[target.id] = {
                    balance: 0,
                    originalRoles: [],
                    wanted: false,
                    wantedReason: null
                };
            }

            db.users[target.id].wanted = true;
            db.users[target.id].wantedReason = reason;

            saveData(db);

            return interaction.reply({
                content:
                    `🚨 تم إدراج ${target} ضمن المطلوبين.\n` +
                    `📋 السبب: **${reason}**`
            });
        }

        // ================= UNWANTED =================

        if (interaction.commandName === 'unwanted') {

            if (!isPolice(member) && !isOwner(member)) {

                return interaction.reply({
                    content: '❌ هذا الأمر مخصص للشرطة فقط.',
                    ephemeral: true
                });
            }

            const target = interaction.options.getUser('user');

            if (!db.users[target.id]?.wanted) {

                return interaction.reply({
                    content: '❌ هذا اللاعب ليس مطلوبًا.',
                    ephemeral: true
                });
            }

            db.users[target.id].wanted = false;
            db.users[target.id].wantedReason = null;

            saveData(db);

            return interaction.reply({
                content: `✅ تم إزالة ${target} من قائمة المطلوبين.`
            });
        }

        // ================= ARREST =================

        if (interaction.commandName === 'arrest') {

            if (!isPolice(member) && !isOwner(member)) {

                return interaction.reply({
                    content: '❌ هذا الأمر مخصص للشرطة فقط.',
                    ephemeral: true
                });
            }

            const target = interaction.options.getUser('user');

            if (!db.users[target.id]?.wanted) {

                return interaction.reply({
                    content: '❌ هذا اللاعب ليس مطلوبًا.',
                    ephemeral: true
                });
            }

            db.users[target.id].wanted = false;
            db.users[target.id].wantedReason = null;

            saveData(db);

            return interaction.reply({
                content: `🚔 تم القبض على ${target} بنجاح.`
            });
        }

    } catch (error) {

        console.error(error);

        if (!interaction.replied && !interaction.deferred) {

            await interaction.reply({
                content: '❌ حدث خطأ غير متوقع داخل البوت.',
                ephemeral: true
            });
        }
    }
});

// ==================== أزرار السرقة ====================

client.on('interactionCreate', async interaction => {

    if (!interaction.isButton()) return;

    const customId = interaction.customId;

    if (!customId.startsWith('rob_')) return;

    const parts = customId.split('_');
    const type = parts[1];
    const ownerId = parts[2];

    if (interaction.user.id !== ownerId) {

        return interaction.reply({
            content: '❌ هذا الزر ليس مخصصًا لك.',
            ephemeral: true
        });
    }

    const db = getData();

    if (!db.users) db.users = {};

    if (type === 'store') {

        const reward = Math.floor(Math.random() * 5000) + 1000;

        if (!db.users[ownerId]) {

            db.users[ownerId] = {
                balance: 0,
                originalRoles: [],
                wanted: false,
                wantedReason: null
            };
        }

        db.users[ownerId].balance += reward;

        saveData(db);

        return interaction.update({
            content:
                `🏪 تمت سرقة المتجر بنجاح!\n` +
                `💰 حصلت على **$${reward.toLocaleString()}**`,
            embeds: [],
            components: []
        });
    }

    if (type === 'bank') {

        const reward = Math.floor(Math.random() * 20000) + 5000;

        if (!db.users[ownerId]) {

            db.users[ownerId] = {
                balance: 0,
                originalRoles: [],
                wanted: false,
                wantedReason: null
            };
        }

        db.users[ownerId].balance += reward;

        saveData(db);

        return interaction.update({
            content:
                `🏦 تمت عملية سرقة البنك بنجاح!\n` +
                `💰 حصلت على **$${reward.toLocaleString()}**`,
            embeds: [],
            components: []
        });
    }
});

// ==================== انتهاء السجن تلقائيًا ====================

setInterval(async () => {

    try {

        const db = getData();

        if (!db.jail) return;

        for (const [userId, jailData] of Object.entries(db.jail)) {

            if (Date.now() < jailData.endsAt) continue;

            for (const guild of client.guilds.cache.values()) {

                try {

                    const member = await guild.members.fetch(userId);

                    await member.roles.set(jailData.originalRoles);

                } catch (error) {

                    console.log(`تعذر إرجاع رتب اللاعب ${userId}`);
                }
            }

            delete db.jail[userId];
        }

        saveData(db);

    } catch (error) {

        console.error('خطأ في نظام السجن:', error);
    }

}, 30 * 1000);

// ==================== توزيع رواتب الشرطة تلقائيًا ====================

setInterval(async () => {

    try {

        const db = getData();

        if (!db.users) {
            db.users = {};
        }

        for (const guild of client.guilds.cache.values()) {

            const members = await guild.members.fetch();

            for (const [, member] of members) {

                // تجاهل البوتات
                if (member.user.bot) continue;

                let salary = 0;
                let rankName = '';

                // قائد الشرطة - يأخذ أعلى راتب
                if (
                    member.roles.cache.has(
                        config.roles.policeLeader
                    )
                ) {

                    salary = policeSalaries.policeLeader;
                    rankName = '👑 قائد الشرطة';

                }

                // نائب قائد الشرطة
                else if (
                    member.roles.cache.has(
                        config.roles.policeDeputy
                    )
                ) {

                    salary = policeSalaries.policeDeputy;
                    rankName = '🛡️ نائب قائد الشرطة';

                }

                // ضابط الشرطة
                else if (
                    member.roles.cache.has(
                        config.roles.policeOfficer
                    )
                ) {

                    salary = policeSalaries.policeOfficer;
                    rankName = '👮 ضابط الشرطة';

                }

                // غير الشرطة لا يحصل على راتب
                if (salary === 0) continue;

                // إنشاء بيانات اللاعب
                if (!db.users[member.id]) {

                    db.users[member.id] = {
                        balance: 0,
                        originalRoles: [],
                        wanted: false,
                        wantedReason: null
                    };
                }

                // إضافة الراتب
                db.users[member.id].balance += salary;

                // إرسال رسالة خاصة
                try {

                    const embed = new EmbedBuilder()
                        .setTitle('💰 وصل راتبك!')
                        .setDescription(
                            `👮 رتبتك: **${rankName}**\n\n` +
                            `💵 استلمت: **$${salary.toLocaleString()}**\n\n` +
                            `🏦 تم إيداع الراتب في رصيدك بنجاح.`
                        )
                        .setColor(0x00FF00)
                        .setFooter({
                            text: 'نظام رواتب الشرطة'
                        });

                    await member.send({
                        embeds: [embed]
                    });

                } catch (error) {

                    console.log(
                        `⚠️ تعذر إرسال رسالة خاصة إلى ${member.user.tag}`
                    );
                }
            }
        }

        saveData(db);

        console.log('💰 تم توزيع رواتب الشرطة بنجاح.');

    } catch (error) {

        console.error(
            '❌ خطأ في نظام رواتب الشرطة:',
            error
        );
    }

}, SALARY_INTERVAL);

// ==================== تشغيل ====================

if (!process.env.TOKEN) {

    console.error(
        '❌ لم يتم العثور على TOKEN في متغيرات البيئة.'
    );

    process.exit(1);
}

client.login(process.env.TOKEN);
