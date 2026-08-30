const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const { getData, saveData } = require("./database");
const config = require("./config");

// =========================
// تشغيل العميل
// =========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// =========================
// المتاجر
// =========================

const POLICE_SHOP = [
  {
    id: "taser",
    name: "⚡ صاعق كهربائي (تلايزر)",
    price: 10000,
    desc: "أداة سريعة لشل حركة المشتبه بهم."
  },
  {
    id: "vest",
    name: "🛡️ درع تكتيكي ثقيل",
    price: 25000,
    desc: "حماية إضافية أثناء الاشتباكات الأمنية."
  },
  {
    id: "glock",
    name: "🔫 مسدس بيرتا 9مم",
    price: 50000,
    desc: "سلاح خدمة شخصي لعناصر الشرطة."
  },
  {
    id: "charger",
    name: "🚔 سيارة دورية شرطة",
    price: 350000,
    desc: "سيارة مطاردات سريعة."
  }
];

const GANG_SHOP = [
  {
    id: "lockpick",
    name: "🔓 عدة خلع أقفال",
    price: 15000,
    desc: "تستخدم لفك الأبواب وتنفيذ السرقات الميدانية."
  },
  {
    id: "mask",
    name: "🎭 قناع إخفاء الهوية",
    price: 20000,
    desc: "لإخفاء الملامح أثناء الهجوم والسطو."
  },
  {
    id: "pistol_black",
    name: "🖤 مسدس غير مرخص",
    price: 60000,
    desc: "سلاح شخصي للسوق السوداء."
  },
  {
    id: "ak47",
    name: "🔥 رشاش أوتوماتيكي AK-47",
    price: 200000,
    desc: "قوة نارية للاشتباكات داخل نظام اللعبة."
  },
  {
    id: "armored_car",
    name: "🚐 فان تهريب مصفح",
    price: 500000,
    desc: "لنقل الأموال والمجرمين داخل نظام اللعبة."
  }
];

// =========================
// تهيئة قاعدة البيانات
// =========================

function dbInit(db) {
  if (!db.users) db.users = {};
  if (!db.gangs) db.gangs = {};
  if (!db.jail) db.jail = {};
  if (!db.invites) db.invites = {};
  if (!db.reports) db.reports = {};
  if (!db.wars) db.wars = {};
  if (!db.missions) db.missions = {};
  if (!db.cooldowns) db.cooldowns = {};

  return db;
}

// =========================
// بيانات المستخدم
// =========================

function user(db, id) {
  if (!db.users[id]) {
    db.users[id] = {
      balance: 0,
      bank: 0,
      inventory: [],
      wanted: false,
      wantedReason: null
    };
  }

  if (!Array.isArray(db.users[id].inventory)) {
    db.users[id].inventory = [];
  }

  return db.users[id];
}

// =========================
// الرتب
// =========================

function role(member, id) {
  return Boolean(id && member.roles.cache.has(id));
}

function owner(member) {
  return role(member, config.roles.owner);
}

function police(member) {
  return (
    owner(member) ||
    role(member, config.roles.policeLeader) ||
    role(member, config.roles.policeDeputy) ||
    role(member, config.roles.policeOfficer)
  );
}

function policeLeader(member) {
  return (
    owner(member) ||
    role(member, config.roles.policeLeader)
  );
}

function policeDeputy(member) {
  return (
    policeLeader(member) ||
    role(member, config.roles.policeDeputy)
  );
}

// =========================
// العصابات
// =========================

function gangOf(db, id) {
  for (const [gid, gang] of Object.entries(db.gangs)) {
    if (
      gang.members &&
      Array.isArray(gang.members) &&
      gang.members.includes(id)
    ) {
      return {
        id: gid,
        gang
      };
    }
  }

  return null;
}

function gangManagement(db, id) {
  const result = gangOf(db, id);

  if (!result) return false;

  return (
    result.gang.leader === id ||
    result.gang.deputy === id
  );
}

// =========================
// المال
// =========================

function money(n) {
  return Number(n || 0).toLocaleString();
}

// =========================
// إدارة الرتب
// =========================

async function giveRole(member, id) {
  if (!id) return;

  if (!member.roles.cache.has(id)) {
    await member.roles.add(id);
  }
}

async function takeRole(member, id) {
  if (!id) return;

  if (member.roles.cache.has(id)) {
    await member.roles.remove(id);
  }
}

// =========================
// الأوامر
// =========================

const commands = [
  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("عرض رصيدك ومعدات حقيبتك"),

  new SlashCommandBuilder()
    .setName("toprich")
    .setDescription("عرض أغنى اللاعبين"),

  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("عرض متجر الشرطة"),

  new SlashCommandBuilder()
    .setName("gangshop")
    .setDescription("عرض سوق العصابات"),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("شراء من متجر الشرطة")
    .addStringOption(o =>
      o
        .setName("item")
        .setDescription("اختر الغرض")
        .setRequired(true)
        .addChoices(
          ...POLICE_SHOP.map(i => ({
            name: `${i.name} ($${money(i.price)})`,
            value: i.id
          }))
        )
    ),

  new SlashCommandBuilder()
    .setName("gangbuy")
    .setDescription("شراء من السوق السوداء")
    .addStringOption(o =>
      o
        .setName("item")
        .setDescription("اختر الغرض")
        .setRequired(true)
        .addChoices(
          ...GANG_SHOP.map(i => ({
            name: `${i.name} ($${money(i.price)})`,
            value: i.id
          }))
        )
    ),

  new SlashCommandBuilder()
    .setName("deposit")
    .setDescription("إيداع أموال في البنك")
    .addIntegerOption(o =>
      o
        .setName("amount")
        .setDescription("المبلغ")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("سحب أموال من البنك")
    .addIntegerOption(o =>
      o
        .setName("amount")
        .setDescription("المبلغ")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("transfer")
    .setDescription("تحويل أموال إلى لاعب")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o
        .setName("amount")
        .setDescription("المبلغ")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("gangdeposit")
    .setDescription("إيداع في بنك العصابة")
    .addIntegerOption(o =>
      o
        .setName("amount")
        .setDescription("المبلغ")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("gangwithdraw")
    .setDescription("سحب من بنك العصابة")
    .addIntegerOption(o =>
      o
        .setName("amount")
        .setDescription("المبلغ")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("gangstoreitem")
    .setDescription("تخزين الحشيش في مخزن العصابة")
    .addIntegerOption(o =>
      o
        .setName("amount")
        .setDescription("الكمية بالكيلو")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("addmoney")
    .setDescription("إضافة أموال")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o
        .setName("amount")
        .setDescription("المبلغ")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("removemoney")
    .setDescription("سحب أموال")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o
        .setName("amount")
        .setDescription("المبلغ")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("creategang")
    .setDescription("إنشاء عصابة")
    .addStringOption(o =>
      o
        .setName("name")
        .setDescription("اسم العصابة")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("disbandgang")
    .setDescription("حل العصابة"),

  new SlashCommandBuilder()
    .setName("ganginfo")
    .setDescription("معلومات العصابة"),

  new SlashCommandBuilder()
    .setName("ganginvite")
    .setDescription("دعوة عضو للعصابة")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("gangkick")
    .setDescription("طرد عضو من العصابة")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("leavegang")
    .setDescription("مغادرة العصابة"),

  new SlashCommandBuilder()
    .setName("gangbank")
    .setDescription("عرض بنك العصابة"),

  new SlashCommandBuilder()
    .setName("gangstorage")
    .setDescription("عرض مخزن العصابة"),

  new SlashCommandBuilder()
    .setName("policeinfo")
    .setDescription("معلومات الشرطة"),

  new SlashCommandBuilder()
    .setName("policeinvite")
    .setDescription("دعوة عضو للشرطة")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("policekick")
    .setDescription("طرد عضو من الشرطة")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("policemissions")
    .setDescription("مهام الشرطة"),

  new SlashCommandBuilder()
    .setName("jail")
    .setDescription("سجن عضو")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o
        .setName("minutes")
        .setDescription("مدة السجن بالدقائق")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1440)
    ),

  new SlashCommandBuilder()
    .setName("unjail")
    .setDescription("فك السجن")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("wanted")
    .setDescription("جعل عضو مطلوب")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    )
    .addStringOption(o =>
      o
        .setName("reason")
        .setDescription("السبب")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unwanted")
    .setDescription("إزالة المطلوبية")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("العضو")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("arrest")
    .setDescription("القبض على مطلوب")
    .addUserOption(o =>
      o
        .setName("user")
        .setDescription("المطلوب")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("report")
    .setDescription("تقديم بلاغ")
    .addStringOption(o =>
      o
        .setName("text")
        .setDescription("البلاغ")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("rob")
    .setDescription("تنفيذ عملية عصابة"),

  new SlashCommandBuilder()
    .setName("mission")
    .setDescription("عرض مهمتك اليومية")
].map(x => x.toJSON());

// =========================
// مناطق الحرب
// =========================

const WAR_ZONES = [
  {
    id: "zone_1",
    name: "المطار",
    channelId: config.channels?.zone1
  },
  {
    id: "zone_2",
    name: "الميناء",
    channelId: config.channels?.zone2
  },
  {
    id: "zone_3",
    name: "المنطقة الصناعية",
    channelId: config.channels?.zone3
  },
  {
    id: "zone_4",
    name: "المستودعات",
    channelId: config.channels?.zone4
  },
  {
    id: "zone_5",
    name: "السوق التجاري",
    channelId: config.channels?.zone5
  }
];

// =========================
// الرواتب التلقائية
// كل ساعتين
// =========================

function setupAutoSalaries(clientInstance) {
  const INTERVAL_TIME = 2 * 60 * 60 * 1000;

  setInterval(async () => {
    try {
      const db = dbInit(getData());

      const guild = clientInstance.guilds.cache.first();

      if (!guild) return;

      const members = await guild.members.fetch();

      let distributedCount = 0;

      members.forEach(member => {
        if (member.user.bot) return;

        const uData = user(db, member.id);

        let salaryAmount = 0;

        if (role(member, config.roles.policeLeader)) {
          salaryAmount = 30000;
        } else if (role(member, config.roles.policeDeputy)) {
          salaryAmount = 20000;
        } else if (role(member, config.roles.policeOfficer)) {
          salaryAmount = 15000;
        }

        if (salaryAmount > 0) {
          uData.bank = (uData.bank || 0) + salaryAmount;
          distributedCount++;
        }
      });

      saveData(db);

      console.log(
        `💰 تم توزيع الرواتب على ${distributedCount} من أعضاء الشرطة.`
      );

    } catch (error) {
      console.error(
        "❌ خطأ في توزيع الرواتب التلقائي:",
        error
      );
    }
  }, INTERVAL_TIME);
}

// =========================
// فك السجن التلقائي
// كل 30 ثانية
// =========================

function setupAutoUnjail(clientInstance) {
  setInterval(async () => {
    try {
      const db = dbInit(getData());
      const now = Date.now();

      for (const [userId, jailData] of Object.entries(db.jail)) {

        if (!jailData || !jailData.ends) {
          delete db.jail[userId];
          continue;
        }

        if (now >= jailData.ends) {

          try {
            const guild = clientInstance.guilds.cache.first();

            if (!guild) continue;

            const member = await guild.members
              .fetch(userId)
              .catch(() => null);

            if (member) {
              const oldRoles = Array.isArray(jailData.roles)
                ? jailData.roles
                : [];

              const validRoles = oldRoles.filter(
                roleId => roleId !== guild.id
              );

              await member.roles.set(validRoles);
            }

            delete db.jail[userId];

            console.log(
              `🔓 تم فك سجن العضو تلقائياً: ${userId}`
            );

          } catch (error) {
            console.error(
              `❌ خطأ في فك سجن ${userId}:`,
              error
            );
          }
        }
      }

      saveData(db);

    } catch (error) {
      console.error(
        "❌ Jail System Error:",
        error
      );
    }
  }, 30000);
}

// =========================
// الحرب التلقائية
// =========================

function setupAutoWars(clientInstance) {

  setInterval(async () => {

    try {

      const now = new Date();

      const day = now.getDay();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      // الأحد إلى الخميس الساعة 20:00
      if (
        day >= 0 &&
        day <= 4 &&
        hours === 20 &&
        minutes === 0
      ) {

        const db = dbInit(getData());

        const gangsList = Object.entries(db.gangs);

        if (gangsList.length === 0) return;

        const randomGangEntry =
          gangsList[
            Math.floor(Math.random() * gangsList.length)
          ];

        const gangId = randomGangEntry[0];
        const gangData = randomGangEntry[1];

        const zone =
          WAR_ZONES[day] ||
          WAR_ZONES[0];

        if (!zone.channelId) {
          console.log(
            `⚠️ لم يتم تحديد روم الحرب للمنطقة: ${zone.name}`
          );
          return;
        }

        const channel =
          await clientInstance.channels
            .fetch(zone.channelId)
            .catch(() => null);

        if (!channel) return;

        const warId = `war_${Date.now()}`;

        db.wars[warId] = {
          gangId,
          gangLeaderId: gangData.leader,
          policeScore: 0,
          gangScore: 0,
          policeTeam: [],
          gangTeam: [],
          participants: {},
          status: "recruiting",
          startedAt: Date.now()
        };

        saveData(db);

        let timeLeft = 180;

        const row =
          new ActionRowBuilder()
            .addComponents(

              new ButtonBuilder()
                .setCustomId(
                  `war_join_police_${warId}`
                )
                .setLabel(
                  "🚔 الشرطة (0/6)"
                )
                .setStyle(
                  ButtonStyle.Primary
                ),

              new ButtonBuilder()
                .setCustomId(
                  `war_join_gang_${warId}`
                )
                .setLabel(
                  `⚔️ ${gangData.name} (0/6)`
                )
                .setStyle(
                  ButtonStyle.Danger
                )
            );

        const embed =
          new EmbedBuilder()
            .setTitle(
              `🚨 حرب في ${zone.name}`
            )
            .setDescription(
              `🔥 بدأت فترة التسجيل للحرب بين **الشرطة** وعصابة **${gangData.name}**.\n\n` +
              `⏳ مدة التسجيل: **3 دقائق**\n` +
              `👥 الحد الأدنى: **4 لاعبين لكل فريق**\n` +
              `👥 الحد الأقصى: **6 لاعبين لكل فريق**`
            )
            .setColor(0xffa500)
            .setTimestamp();

        const response =
          await channel
            .send({
              embeds: [embed],
              components: [row]
            })
            .catch(() => null);

        if (!response) return;

        const countdownInterval =
          setInterval(async () => {

            timeLeft -= 10;

            if (timeLeft <= 0) {
              clearInterval(countdownInterval);
              return;
            }

            try {

              const currentDb =
                dbInit(getData());

              const currentWar =
                currentDb.wars[warId];

              if (
                !currentWar ||
                currentWar.status !== "recruiting"
              ) {
                clearInterval(countdownInterval);
                return;
              }

              const updatedRow =
                new ActionRowBuilder()
                  .addComponents(

                    new ButtonBuilder()
                      .setCustomId(
                        `war_join_police_${warId}`
                      )
                      .setLabel(
                        `🚔 الشرطة (${currentWar.policeTeam.length}/6)`
                      )
                      .setStyle(
                        ButtonStyle.Primary
                      ),

                    new ButtonBuilder()
                      .setCustomId(
                        `war_join_gang_${warId}`
                      )
                      .setLabel(
                        `⚔️ ${gangData.name} (${currentWar.gangTeam.length}/6)`
                      )
                      .setStyle(
                        ButtonStyle.Danger
                      )
                  );

              const updatedEmbed =
                new EmbedBuilder()
                  .setTitle(
                    `🚨 حرب في ${zone.name}`
                  )
                  .setDescription(
                    `🔥 التسجيل مستمر.\n\n` +
                    `⏳ المتبقي: **${timeLeft} ثانية**\n\n` +
                    `🚔 **الشرطة (${currentWar.policeTeam.length}/6):**\n` +
                    `${currentWar.policeTeam.map(
                      x => `<@${x}>`
                    ).join(", ") || "لا يوجد"}\n\n` +
                    `⚔️ **${gangData.name} (${currentWar.gangTeam.length}/6):**\n` +
                    `${currentWar.gangTeam.map(
                      x => `<@${x}>`
                    ).join(", ") || "لا يوجد"}`
                  )
                  .setColor(0xffa500);

              await response
                .edit({
                  embeds: [updatedEmbed],
                  components: [updatedRow]
                })
                .catch(() => {});

            } catch {
              clearInterval(countdownInterval);
            }

          }, 10000);

        // انتهاء التسجيل بعد 3 دقائق
        setTimeout(async () => {

          clearInterval(countdownInterval);

          try {

            const currentDb =
              dbInit(getData());

            const currentWar =
              currentDb.wars[warId];

            if (
              !currentWar ||
              currentWar.status !== "recruiting"
            ) return;

            if (
              currentWar.policeTeam.length < 4 ||
              currentWar.gangTeam.length < 4
            ) {

              currentWar.status = "cancelled";

              saveData(currentDb);

              const cancelEmbed =
                new EmbedBuilder()
                  .setTitle(
                    "❌ تم إلغاء الحرب"
                  )
                  .setDescription(
                    "لم يكتمل العدد المطلوب.\n\n" +
                    "الحد الأدنى هو **4 لاعبين لكل فريق**."
                  )
                  .setColor(0x808080);

              await response
                .edit({
                  embeds: [cancelEmbed],
                  components: []
                })
                .catch(() => {});

              return;
            }

            currentWar.status = "active";
            currentWar.warStartTime = Date.now();

            saveData(currentDb);

            await updateActiveWarMessage(
              response,
              currentWar,
              gangData.name
            );

            // الحرب تستمر 10 دقائق
            setTimeout(async () => {
              await endWarAutomatically(
                clientInstance,
                warId,
                gangData.name,
                response
              );
            }, 10 * 60 * 1000);

          } catch (error) {
            console.error(
              "❌ War Start Error:",
              error
            );
          }

        }, 180000);

      }

    } catch (error) {
      console.error(
        "❌ Auto War Error:",
        error
      );
    }

  }, 60000);
}

// =========================
// تحديث رسالة الحرب
// =========================

async function updateActiveWarMessage(
  message,
  warData,
  gangName
) {

  const policeButtons =
    warData.policeTeam.map(
      (id, index) =>
        new ButtonBuilder()
          .setCustomId(
            `war_p_${warData.gangId}_${id}`
          )
          .setLabel(
            `🚔 شرطي ${index + 1}`
          )
          .setStyle(
            ButtonStyle.Primary
          )
    );

  const gangButtons =
    warData.gangTeam.map(
      (id, index) =>
        new ButtonBuilder()
          .setCustomId(
            `war_g_${warData.gangId}_${id}`
          )
          .setLabel(
            `⚔️ عصابة ${index + 1}`
          )
          .setStyle(
            ButtonStyle.Danger
          )
    );

  const endBtn =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `war_manual_end_${warData.gangId}`
          )
          .setLabel(
            "🏁 إنهاء الحرب"
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      );

  const rows = [];

  for (
    let i = 0;
    i < policeButtons.length;
    i += 5
  ) {
    rows.push(
      new ActionRowBuilder()
        .addComponents(
          policeButtons.slice(i, i + 5)
        )
    );
  }

  for (
    let i = 0;
    i < gangButtons.length;
    i += 5
  ) {
    rows.push(
      new ActionRowBuilder()
        .addComponents(
          gangButtons.slice(i, i + 5)
        )
    );
  }

  rows.push(endBtn);

  const embed =
    new EmbedBuilder()
      .setTitle(
        "⚔️ الحرب بدأت!"
      )
      .setDescription(
        `🔥 الحرب بين الشرطة وعصابة **${gangName}** بدأت الآن.\n\n` +
        `⏱️ مدة الحرب: **10 دقائق**\n\n` +
        `📊 **النتيجة:**\n` +
        `🚔 الشرطة: **${warData.policeScore}**\n` +
        `⚔️ ${gangName}: **${warData.gangScore}**`
      )
      .setColor(0xff0000);

  await message
    .edit({
      embeds: [embed],
      components: rows
    })
    .catch(() => {});
}

// =========================
// إنهاء الحرب
// =========================

async function endWarAutomatically(
  clientInstance,
  warId,
  gangName,
  message = null
) {

  try {

    const db = dbInit(getData());

    const war = db.wars[warId];

    if (
      !war ||
      war.status !== "active"
    ) return;

    war.status = "ended";

    let resultText = "";

    if (
      war.policeScore >
      war.gangScore
    ) {

      resultText =
        `🚔 **الشرطة فازت بالحرب!**\n\n` +
        `🚔 نقاط الشرطة: **${war.policeScore}**\n` +
        `⚔️ نقاط ${gangName}: **${war.gangScore}**`;

      if (db.gangs[war.gangId]) {
        db.gangs[war.gangId].losses =
          (db.gangs[war.gangId].losses || 0) + 1;
      }

    } else if (
      war.gangScore >
      war.policeScore
    ) {

      resultText =
        `⚔️ **عصابة ${gangName} فازت بالحرب!**\n\n` +
        `🚔 نقاط الشرطة: **${war.policeScore}**\n` +
        `⚔️ نقاط العصابة: **${war.gangScore}**`;

      if (db.gangs[war.gangId]) {
        db.gangs[war.gangId].wins =
          (db.gangs[war.gangId].wins || 0) + 1;
      }

    } else {

      resultText =
        `🤝 **انتهت الحرب بالتعادل!**\n\n` +
        `🚔 الشرطة: **${war.policeScore}**\n` +
        `⚔️ ${gangName}: **${war.gangScore}**`;
    }

    saveData(db);

    if (message) {

      const embed =
        new EmbedBuilder()
          .setTitle(
            "🏁 انتهت الحرب"
          )
          .setDescription(
            resultText
          )
          .setColor(0x00ff00)
          .setTimestamp();

      await message
        .edit({
          embeds: [embed],
          components: []
        })
        .catch(() => {});
    }

  } catch (error) {

    console.error(
      "❌ Auto End War Error:",
      error
    );

  }
}

// =========================
// جاهزية البوت
// =========================

client.once("ready", async () => {

  console.log(
    `✅ البوت يعمل بنجاح باسم: ${client.user.tag}`
  );

  try {

    const rest =
      new REST({
        version: "10"
      }).setToken(
        process.env.TOKEN
      );

    await rest.put(
      Routes.applicationCommands(
        client.user.id
      ),
      {
        body: commands
      }
    );

    console.log(
      "✅ تم تسجيل الأوامر بنجاح"
    );

  } catch (error) {

    console.error(
      "❌ خطأ تسجيل الأوامر:",
      error
    );

  }

  // تشغيل الأنظمة التلقائية
  setupAutoWars(client);
  setupAutoSalaries(client);
  setupAutoUnjail(client);

});

// =========================
// أوامر Slash
// =========================

client.on(
  "interactionCreate",
  async interaction => {

    if (!interaction.isChatInputCommand()) {
      return;
    }

    try {

      const db =
        dbInit(getData());

      const id =
        interaction.user.id;

      const member =
        interaction.member;

      const uData =
        user(db, id);

      // =========================
      // BALANCE
      // =========================

      if (
        interaction.commandName === "balance"
      ) {

        const embed =
          new EmbedBuilder()
            .setTitle(
              `💳 الملف الشخصي لـ ${interaction.user.username}`
            )
            .addFields(
              {
                name: "💵 المحفظة",
                value:
                  `**$${money(uData.balance)}**`,
                inline: true
              },
              {
                name: "🏦 البنك",
                value:
                  `**$${money(uData.bank)}**`,
                inline: true
              },
              {
                name: "🎒 الحقيبة",
                value:
                  uData.inventory.length > 0
                    ? uData.inventory.join(", ")
                    : "الحقيبة فارغة",
                inline: false
              }
            )
            .setColor(0xffd700);

        return interaction.reply({
          embeds: [embed],
          ephemeral: true
        });
      }

      // =========================
      // TOP RICH
      // =========================

      if (
        interaction.commandName === "toprich"
      ) {

        const sortedUsers =
          Object.entries(db.users)
            .map(
              ([userId, data]) => {

                const balance =
                  data.balance || 0;

                const bank =
                  data.bank || 0;

                return {
                  userId,
                  balance,
                  bank,
                  totalMoney:
                    balance + bank
                };
              }
            )
            .sort(
              (a, b) =>
                b.totalMoney -
                a.totalMoney
            )
            .slice(0, 10);

        if (
          sortedUsers.length === 0
        ) {

          return interaction.reply({
            content:
              "❌ لا توجد بيانات مالية.",
            ephemeral: true
          });
        }

        let description = "";

        sortedUsers.forEach(
          (item, index) => {

            let medal = "🏅";

            if (index === 0)
              medal = "👑";
            else if (index === 1)
              medal = "🥈";
            else if (index === 2)
              medal = "🥉";

            description +=
              `${medal} **${index + 1}.** <@${item.userId}>\n` +
              `💰 المجموع: **$${money(item.totalMoney)}**\n\n`;
          }
        );

        const embed =
          new EmbedBuilder()
            .setTitle(
              "🏆 أغنى اللاعبين"
            )
            .setDescription(
              description
            )
            .setColor(0xffd700);

        return interaction.reply({
          embeds: [embed]
        });
      }

      // =========================
      // DEPOSIT
      // =========================

      if (
        interaction.commandName === "deposit"
      ) {

        const amount =
          interaction.options.getInteger(
            "amount"
          );

        if (
          uData.balance < amount
        ) {

          return interaction.reply({
            content:
              `❌ رصيد المحفظة غير كافٍ.\nرصيدك: **$${money(uData.balance)}**`,
            ephemeral: true
          });
        }

        uData.balance -= amount;
        uData.bank += amount;

        saveData(db);

        return interaction.reply({
          content:
            `✅ تم إيداع **$${money(amount)}** في البنك.`,
          ephemeral: true
        });
      }

      // =========================
      // WITHDRAW
      // =========================

      if (
        interaction.commandName === "withdraw"
      ) {

        const amount =
          interaction.options.getInteger(
            "amount"
          );

        if (
          uData.bank < amount
        ) {

          return interaction.reply({
            content:
              `❌ رصيد البنك غير كافٍ.\nرصيدك: **$${money(uData.bank)}**`,
            ephemeral: true
          });
        }

        uData.bank -= amount;
        uData.balance += amount;

        saveData(db);

        return interaction.reply({
          content:
            `✅ تم سحب **$${money(amount)}** إلى محفظتك.`,
          ephemeral: true
        });
      }

      // =========================
      // TRANSFER
      // =========================

      if (
        interaction.commandName === "transfer"
      ) {

        const targetUser =
          interaction.options.getUser(
            "user"
          );

        const amount =
          interaction.options.getInteger(
            "amount"
          );

        if (
          targetUser.id === id
        ) {

          return interaction.reply({
            content:
              "❌ لا يمكنك التحويل لنفسك.",
            ephemeral: true
          });
        }

        if (
          uData.balance < amount
        ) {

          return interaction.reply({
            content:
              "❌ رصيدك غير كافٍ.",
            ephemeral: true
          });
        }

        const targetData =
          user(
            db,
            targetUser.id
          );

        uData.balance -= amount;
        targetData.balance += amount;

        saveData(db);

        return interaction.reply(
          `✅ تم تحويل **$${money(amount)}** إلى ${targetUser}.`
        );
      }

      // =========================
      // GANG DEPOSIT
      // =========================

      if (
        interaction.commandName === "gangdeposit"
      ) {

        const result =
          gangOf(db, id);

        if (!result) {

          return interaction.reply({
            content:
              "❌ يجب أن تكون داخل عصابة.",
            ephemeral: true
          });
        }

        const amount =
          interaction.options.getInteger(
            "amount"
          );

        if (
          uData.balance < amount
        ) {

          return interaction.reply({
            content:
              "❌ رصيدك غير كافٍ.",
            ephemeral: true
          });
        }

        uData.balance -= amount;

        result.gang.bank =
          (result.gang.bank || 0) +
          amount;

        saveData(db);

        return interaction.reply({
          content:
            `✅ تم إيداع **$${money(amount)}** في بنك العصابة.\n💰 الرصيد: **$${money(result.gang.bank)}**`,
          ephemeral: true
        });
      }

      // =========================
      // GANG WITHDRAW
      // =========================

      if (
        interaction.commandName === "gangwithdraw"
      ) {

        const result =
          gangOf(db, id);

        if (!result) {

          return interaction.reply({
            content:
              "❌ أنت لست داخل عصابة.",
            ephemeral: true
          });
        }

        if (
          !gangManagement(db, id)
        ) {

          return interaction.reply({
            content:
              "❌ الزعيم أو النائب فقط.",
            ephemeral: true
          });
        }

        const amount =
          interaction.options.getInteger(
            "amount"
          );

        if (
          (result.gang.bank || 0) <
          amount
        ) {

          return interaction.reply({
            content:
              "❌ رصيد بنك العصابة غير كافٍ.",
            ephemeral: true
          });
        }

        result.gang.bank -= amount;
        uData.balance += amount;

        saveData(db);

        return interaction.reply({
          content:
            `✅ تم سحب **$${money(amount)}** من بنك العصابة.`,
          ephemeral: true
        });
      }

      // =========================
      // GANG STORE ITEM
      // =========================

      if (
        interaction.commandName === "gangstoreitem"
      ) {

        const result =
          gangOf(db, id);

        if (!result) {

          return interaction.reply({
            content:
              "❌ يجب أن تكون داخل عصابة.",
            ephemeral: true
          });
        }

        const amount =
          interaction.options.getInteger(
            "amount"
          );

        if (!result.gang.storage) {
          result.gang.storage = {
            weed: 0,
            stolen: 0,
            weapons: 0
          };
        }

        result.gang.storage.weed +=
          amount;

        saveData(db);

        return interaction.reply({
          content:
            `🌿 تم تخزين **${amount} كغ** في مخزن العصابة.`,
          ephemeral: true
        });
      }

      // =========================
      // SHOP
      // =========================

      if (
        interaction.commandName === "shop"
      ) {

        const embed =
          new EmbedBuilder()
            .setTitle(
              "🚔 متجر الشرطة"
            )
            .setDescription(
              "استخدم `/buy` لشراء المعدات."
            )
            .setColor(0x0099ff);

        POLICE_SHOP.forEach(
          item => {

            embed.addFields({
              name: item.name,
              value:
                `💰 السعر: **$${money(item.price)}**\n` +
                `📝 ${item.desc}`
            });

          }
        );

        return interaction.reply({
          embeds: [embed],
          ephemeral: true
        });
      }

      // =========================
      // BUY
      // =========================

      if (
        interaction.commandName === "buy"
      ) {

        if (!police(member)) {

          return interaction.reply({
            content:
              "❌ هذا المتجر للشرطة فقط.",
            ephemeral: true
          });
        }

        const itemId =
          interaction.options.getString(
            "item"
          );

        const item =
          POLICE_SHOP.find(
            x => x.id === itemId
          );

        if (!item) {

          return interaction.reply({
            content:
              "❌ الغرض غير موجود.",
            ephemeral: true
          });
        }

        if (
          uData.balance < item.price
        ) {

          return interaction.reply({
            content:
              "❌ أموالك غير كافية.",
            ephemeral: true
          });
        }

        uData.balance -=
          item.price;

        uData.inventory.push(
          item.name
        );

        saveData(db);

        return interaction.reply({
          content:
            `✅ اشتريت **${item.name}** مقابل **$${money(item.price)}**.`,
          ephemeral: true
        });
      }

      // =========================
      // GANG SHOP
      // =========================

      if (
        interaction.commandName === "gangshop"
      ) {

        const embed =
          new EmbedBuilder()
            .setTitle(
              "🏴‍☠️ السوق السوداء"
            )
            .setDescription(
              "استخدم `/gangbuy` للشراء."
            )
            .setColor(0xff0000);

        GANG_SHOP.forEach(
          item => {

            embed.addFields({
              name: item.name,
              value:
                `💰 السعر: **$${money(item.price)}**\n` +
                `📝 ${item.desc}`
            });

          }
        );

        return interaction.reply({
          embeds: [embed],
          ephemeral: true
        });
      }

      // =========================
      // GANG BUY
      // =========================

      if (
        interaction.commandName === "gangbuy"
      ) {

        if (!gangOf(db, id)) {

          return interaction.reply({
            content:
              "❌ السوق السوداء للعصابات فقط.",
            ephemeral: true
          });
        }

        const itemId =
          interaction.options.getString(
            "item"
          );

        const item =
          GANG_SHOP.find(
            x => x.id === itemId
          );

        if (!item) {

          return interaction.reply({
            content:
              "❌ السلعة غير موجودة.",
            ephemeral: true
          });
        }

        if (
          uData.balance < item.price
        ) {

          return interaction.reply({
            content:
              "❌ فلوسك ما تكفي.",
            ephemeral: true
          });
        }

        uData.balance -=
          item.price;

        uData.inventory.push(
          item.name
        );

        saveData(db);

        return interaction.reply({
          content:
            `🔥 تمت الصفقة بنجاح!\nاشتريت **${item.name}** مقابل **$${money(item.price)}**.`,
          ephemeral: true
        });
      }

      // =========================
      // ADD MONEY
      // =========================

      if (
        interaction.commandName === "addmoney"
      ) {

        if (!owner(member)) {

          return interaction.reply({
            content:
              "❌ الأمر للمالك فقط.",
            ephemeral: true
          });
        }

        const target =
          interaction.options.getUser(
            "user"
          );

        const amount =
          interaction.options.getInteger(
            "amount"
          );

        user(
          db,
          target.id
        ).balance += amount;

        saveData(db);

        return interaction.reply(
          `✅ تمت إضافة **$${money(amount)}** إلى ${target}.`
        );
      }

      // =========================
      // REMOVE MONEY
      // =========================

      if (
        interaction.commandName === "removemoney"
      ) {

        if (!owner(member)) {

          return interaction.reply({
            content:
              "❌ الأمر للمالك فقط.",
            ephemeral: true
          });
        }

        const target =
          interaction.options.getUser(
            "user"
          );

        const amount =
          interaction.options.getInteger(
            "amount"
          );

        const targetData =
          user(
            db,
            target.id
          );

        targetData.balance =
          Math.max(
            0,
            targetData.balance -
            amount
          );

        saveData(db);

        return interaction.reply(
          `✅ تم سحب **$${money(amount)}** من ${target}.`
        );
      }

      // =========================
      // CREATE GANG
      // =========================

      if (
        interaction.commandName === "creategang"
      ) {

        if (police(member)) {

          return interaction.reply({
            content:
              "❌ أعضاء الشرطة لا يمكنهم إنشاء عصابة.",
            ephemeral: true
          });
        }

        if (gangOf(db, id)) {

          return interaction.reply({
            content:
              "❌ أنت داخل عصابة مسبقاً.",
            ephemeral: true
          });
        }

        const name =
          interaction.options.getString(
            "name"
          );

        const gid =
          `gang_${Date.now()}`;

        db.gangs[gid] = {
          name,
          leader: id,
          deputy: null,
          members: [id],
          bank: 0,
          storage: {
            weed: 0,
            stolen: 0,
            weapons: 0
          },
          wins: 0,
          losses: 0
        };

        await giveRole(
          member,
          config.roles.gangLeader
        );

        saveData(db);

        return interaction.reply(
          `🔫 تم إنشاء عصابة **${name}** بنجاح.\n👑 الزعيم: ${interaction.user}`
        );
      }

      // =========================
      // DISBAND GANG
      // =========================

      if (
        interaction.commandName === "disbandgang"
      ) {

        const result =
          gangOf(db, id);

        if (!result) {

          return interaction.reply({
            content:
              "❌ أنت لست داخل عصابة.",
            ephemeral: true
          });
        }

        if (
          result.gang.leader !== id
        ) {

          return interaction.reply({
            content:
              "❌ الزعيم فقط يستطيع حل العصابة.",
            ephemeral: true
          });
        }

        for (
          const memberId of result.gang.members
        ) {

          try {

            const target =
              await interaction.guild.members
                .fetch(memberId);

            await takeRole(
              target,
              config.roles.gangLeader
            );

            await takeRole(
              target,
              config.roles.gangDeputy
            );

            await takeRole(
              target,
              config.roles.gangMember
            );

          } catch {}
        }

        const gangName =
          result.gang.name;

        delete db.gangs[result.id];

        saveData(db);

        return interaction.reply(
          `🗑️ تم حل عصابة **${gangName}** نهائياً.`
        );
      }

      // =========================
      // GANG INFO
      // =========================

      if (
        interaction.commandName === "ganginfo"
      ) {

        const result =
          gangOf(db, id);

        if (!result) {

          return interaction.reply({
            content:
              "❌ أنت لست داخل عصابة.",
            ephemeral: true
          });
        }

        const g =
          result.gang;

        if (!g.storage) {
          g.storage = {
            weed: 0,
            stolen: 0,
            weapons: 0
          };
        }

        const embed =
          new EmbedBuilder()
            .setTitle(
              `🔫 معلومات عصابة ${g.name}`
            )
            .addFields(
              {
                name: "👑 الزعيم",
                value: `<@${g.leader}>`,
                inline: true
              },
              {
                name: "🥷 النائب",
                value:
                  g.deputy
                    ? `<@${g.deputy}>`
                    : "لا يوجد",
                inline: true
              },
              {
                name: "👥 الأعضاء",
                value:
                  `${g.members.length}`,
                inline: true
              },
              {
                name: "💰 البنك",
                value:
                  `$${money(g.bank)}`,
                inline: true
              },
              {
                name: "🌿 الحشيش",
                value:
                  `${g.storage.weed} كغ`,
                inline: true
              },
              {
                name: "📦 المسروقات",
                value:
                  `${g.storage.stolen}`,
                inline: true
              },
              {
                name: "🔫 الأسلحة",
                value:
                  `${g.storage.weapons}`,
                inline: true
              },
              {
                name: "👥 قائمة الأعضاء",
                value:
                  g.members.map(
                    x => `<@${x}>`
                  ).join("\n") ||
                  "لا يوجد"
              }
            )
            .setColor(0x8b0000);

        return interaction.reply({
          embeds: [embed]
        });
      }

      // =========================
      // GANG INVITE
      // =========================

      if (
        interaction.commandName === "ganginvite"
      ) {

        if (
          !gangManagement(db, id)
        ) {

          return interaction.reply({
            content:
              "❌ الزعيم والنائب فقط.",
            ephemeral: true
          });
        }

        const target =
          interaction.options.getUser(
            "user"
          );

        if (
          gangOf(db, target.id)
        ) {

          return interaction.reply({
            content:
              "❌ العضو داخل عصابة مسبقاً.",
            ephemeral: true
          });
        }

        const gid =
          gangOf(db, id).id;

        const invite =
          `gang_${Date.now()}`;

        db.invites[invite] = {
          type: "gang",
          gangId: gid,
          to: target.id
        };

        saveData(db);

        const row =
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `ga_${invite}`
                )
                .setLabel("✅ قبول")
                .setStyle(
                  ButtonStyle.Success
                ),

              new ButtonBuilder()
                .setCustomId(
                  `gr_${invite}`
                )
                .setLabel("❌ رفض")
                .setStyle(
                  ButtonStyle.Danger
                )
            );

        const embed =
          new EmbedBuilder()
            .setTitle(
              "📨 دعوة عصابة"
            )
            .setDescription(
              `🔫 العصابة: **${db.gangs[gid].name}**\n` +
              `👤 المدعو: ${target}\n` +
              `👑 الداعي: ${interaction.user}`
            );

        await target.send({
          embeds: [embed],
          components: [row]
        }).catch(() => {});

        return interaction.reply({
          content:
            `✅ تم إرسال الدعوة إلى ${target}.`,
          ephemeral: true
        });
      }

      // =========================
      // GANG KICK
      // =========================

      if (
        interaction.commandName === "gangkick"
      ) {

        if (
          !gangManagement(db, id)
        ) {

          return interaction.reply({
            content:
              "❌ الزعيم والنائب فقط.",
            ephemeral: true
          });
        }

        const result =
          gangOf(db, id);

        const target =
          interaction.options.getMember(
            "user"
          );

        if (
          !target ||
          !result.gang.members.includes(
            target.id
          )
        ) {

          return interaction.reply({
            content:
              "❌ العضو ليس في عصابتك.",
            ephemeral: true
          });
        }

        if (
          target.id ===
          result.gang.leader
        ) {

          return interaction.reply({
            content:
              "❌ لا يمكن طرد الزعيم.",
            ephemeral: true
          });
        }

        result.gang.members =
          result.gang.members.filter(
            x => x !== target.id
          );

        if (
          result.gang.deputy ===
          target.id
        ) {
          result.gang.deputy = null;
        }

        await takeRole(
          target,
          config.roles.gangMember
        );

        await takeRole(
          target,
          config.roles.gangDeputy
        );

        saveData(db);

        return interaction.reply(
          `✅ تم طرد ${target} من العصابة.`
        );
      }

      // =========================
      // LEAVE GANG
      // =========================

      if (
        interaction.commandName === "leavegang"
      ) {

        const result =
          gangOf(db, id);

        if (!result) {
  return interaction.reply({
    content: "❌ أنت لست منضمًا إلى أي عصابة.",
    ephemeral: true
  });
}

if (result.gang.leader === id) {
  return interaction.reply({
    content: "❌ الزعيم لا يستطيع مغادرة العصابة. استخدم `/disbandgang` إذا أردت حل العصابة.",
    ephemeral: true
  });
}

result.gang.members = result.gang.members.filter(
  memberId => memberId !== id
);

if (result.gang.deputy === id) {
  result.gang.deputy = null;
}

await takeRole(member, config.roles.gangMember);
await takeRole(member, config.roles.gangDeputy);

saveData(db);

return interaction.reply({
  content: `✅ غادرت عصابة **${result.gang.name}** بنجاح.`,
  ephemeral: true
});
      }
    }
  } catch (error) {
    console.error("Interaction Error:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ حدث خطأ أثناء تنفيذ الأمر.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// =========================
// تشغيل البوت
// =========================

client.login(process.env.TOKEN);          
