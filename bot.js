const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const express = require('express');

// Токен вашего бота (получен от BotFather)
const token = '8281084452:AAGvCv7Iso-_AzwStWW1wjOyAvC0R8YUvbk';

// Создаём экземпляр бота с улучшенной настройкой Polling
const bot = new TelegramBot(token, {
  polling: {
    interval: 300,
    autoStart: true,
    params: { timeout: 10 }
  }
});

// Ваш ID для админ‑команд
let adminId = 5539123080;

// Список фиксированных названий для 7 команд
const fixedTeamNames = [
  'Грозовые Клинки',
  'Стальные Тени',
  'Пламенные Ястребы',
  'Ледяные Волки',
  'Тёмные Элиты',
  'Молниеносные Охотники',
  'Кровавые Клинки'
];

// Хранилище данных команд (с ограничением до 5 человек в команде)
let teams = {};
fixedTeamNames.forEach(name => {
  teams[name] = { players: [], max: 5 };
});

// Дата и время турнира (переменные)
let tournamentDate = '22.03.2026'; // Дата турнира
let tournamentTime = '14:00';      // Время турнира

// Хранилище для отслеживания регистрации пользователей
let userRegistrations = {}; // { chatId: { registeredTeam: true/false, teamName: '', joinedSolo: false, confirmed: false, confirmationCode: null } }

// Хранилище состояний пользователей
let userState = {}; // { chatId: 'awaiting_team_name' }

// Индекс для последовательного выбора фиксированных команд
let currentTeamIndex = 0;

// Функция для инициализации данных пользователя
function initUser(chatId) {
  if (!userRegistrations[chatId]) {
    userRegistrations[chatId] = {
      registeredTeam: false,
      teamName: '',
      joinedSolo: false,
      confirmed: false,
      confirmationCode: null
    };
  }
}

// Обработка ошибок Polling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// Генерация кода подтверждения
function generateConfirmationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Запуск уведомлений за 24 часа и за 1 час до турнира
cron.schedule('0 0 * * *', () => {
  const now = new Date();
  const tournamentDateTime = new Date(`${tournamentDate} ${tournamentTime}`);
  const timeDiff = tournamentDateTime - now;
  const hoursDiff = timeDiff / (1000 * 60 * 60);

  if (Math.abs(hoursDiff - 24) < 1) {
    Object.keys(userRegistrations).forEach(chatId => {
      if (userRegistrations[chatId].confirmed) {
        bot.sendMessage(chatId, `Напоминаем! Турнир по Dota 2 состоится завтра, ${tournamentDate} в ${tournamentTime}.`);
      }
    });
  } else if (Math.abs(hoursDiff - 1) < 0.1) {
    Object.keys(userRegistrations).forEach(chatId => {
      if (userRegistrations[chatId].confirmed) {
        bot.sendMessage(chatId, `Турнир по Dota 2 начнётся через час, ${tournamentDate} в ${tournamentTime}!`);
      }
    });
  }
});

// Веб‑панель для администратора
const app = express();
const port = 3000;

app.get('/teams', (req, res) => {
  res.json(Object.entries(teams).map(([team, data]) => ({
    name: team,
    players: data.players,
    spotsLeft: data.max - data.players.length
  })));
});

app.listen(port, () => {
  console.log(`Веб‑панель работает на http://localhost:${port}`);
});

// Обработчик команды /start и нажатий на клавиатуру
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Инициализируем данные пользователя
  initUser(chatId);

  // Логирование для отладки
  console.log(`Получено сообщение от ${chatId}: ${text}`);

  // Проверка кода подтверждения (должна быть до основной логики)
  if (userRegistrations[chatId].confirmationCode && text === userRegistrations[chatId].confirmationCode) {
    userRegistrations[chatId].confirmed = true;
    userRegistrations[chatId].confirmationCode = null;
    bot.sendMessage(chatId, 'Регистрация подтверждена! Ждём вас на турнире.');
    return;
  }

  // Проверяем состояние пользователя
  if (userState[chatId] === 'awaiting_team_name') {
    // Пользователь вводит название своей команды
    const teamName = text;

    // Проверяем, что пользователь ещё не создал команду и не участвует в одиночку
    if (userRegistrations[chatId].registeredTeam || userRegistrations[chatId].joinedSolo) {
      bot.sendMessage(chatId, 'Вы уже зарегистрированы! Для создания новой команды сначала удалите текущую командой «Удалить команду».');
      delete userState[chatId];
      return;
    }

    if (teams[teamName]) {
      bot.sendMessage(chatId, 'Такая команда уже существует! Выберите другое название.');
    } else {
      teams[teamName] = { players: [msg.chat.username || msg.chat.first_name], max: 5 };
      userRegistrations[chatId].registeredTeam = true;
      userRegistrations[chatId].teamName = teamName;
      userRegistrations[chatId].joinedSolo = false;

      // Добавляем картинку при успешной регистрации команды
      const registrationPhoto = 'https://uploader-oss-mili.milaadfarzian.workers.dev/download/AgACAgIAAxkBAAIDG2meLfx9Wolxn4BzqBBuN8WIQ89_AAItGWsbgX7xSFPPne2qMyz9AQADAgADeQADOgQ/photos/file_4775.jpg';

      bot.sendPhoto(chatId, registrationPhoto, {
        caption: `Отлично! Вы создали команду "${teamName}". Ждём вас ${tournamentDate} в ${tournamentTime}.`,
        parse_mode: 'Markdown'
      });

      // Отправляем код подтверждения
      const confirmationCode = generateConfirmationCode();
      userRegistrations[chatId].confirmationCode = confirmationCode;
      bot.sendMessage(chatId, `Ваш код подтверждения: ${confirmationCode}.\nОтправьте этот код в ответном сообщении для подтверждения участия.`);
    }

    // Сбрасываем состояние
    delete userState[chatId];
    return;
  } else if (userState[chatId] === 'awaiting_friend_id') {
    const friendChatId = text;
    const userTeam = userRegistrations[chatId].teamName;

    if (teams[userTeam].players.length >= teams[userTeam].max) {
      bot.sendMessage(chatId, 'В команде нет свободных мест!');
      delete userState[chatId];
      return;
    }

    bot.sendMessage(friendChatId, `Вас пригласили в команду "${userTeam}"! Напишите "/join ${userTeam}" для подтверждения.`);
    bot.sendMessage(chatId, 'Приглашение отправлено! Попросите друга написать "/join ${userTeam}" для присоединения.');
    delete userState[chatId];
    return;
  }

  if (text === '/start') {
    bot.sendPhoto(chatId, 'https://uploader-oss-mili.milaadfarzian.workers.dev/download/AgACAgIAAxkBAAIDF2meAAEHpxsnjz3A_NKLqmBvmZPFaQACURhrG4F-8UijXxs5AAG70igBAAMCAAN5AAM6BA/photos/file_4773.jpg', {
      caption: 'Приветствуем! Это бот для регистрации на бесплатные турниры по игре Dota 2.',
      reply_markup: {
        keyboard: [
          ['Создать свою команду'],
          ['Участвовать в одиночку'],
          ['Пригласить друга'],
          ['Статистика']
        ],
        resize_keyboard: true
              }
    });
  } else if (text === 'Создать свою команду') {
    // Проверяем, не создал ли пользователь уже команду или не участвует ли в одиночку
    if (userRegistrations[chatId].registeredTeam || userRegistrations[chatId].joinedSolo) {
      bot.sendMessage(chatId, 'Вы уже зарегистрированы! Для создания новой команды сначала удалите текущую командой «Удалить команду».');
      return;
    }
    bot.sendMessage(chatId, 'Введите название вашей команды:');
    // Устанавливаем состояние ожидания ввода названия команды
    userState[chatId] = 'awaiting_team_name';
  } else if (text === 'Участвовать в одиночку') {
    // Проверка на повторную регистрацию в одиночку или создание команды
    if (userRegistrations[chatId].joinedSolo || userRegistrations[chatId].registeredTeam) {
      if (userRegistrations[chatId].registeredTeam) {
        bot.sendMessage(chatId, 'Вы уже создали команду. Напишите ниже «Удалить команду», чтобы удалить её и зарегистрироваться в одиночку.');
      } else {
        bot.sendMessage(chatId, 'Вы уже зарегистрированы для участия в турнире в одиночку!');
      }
      return;
    }

    // Автоматически распределяем в одну из 7 фиксированных команд
    let assignedTeamName = fixedTeamNames[currentTeamIndex];

    // Если текущая команда заполнена — переходим к следующей
    while (teams[assignedTeamName].players.length >= teams[assignedTeamName].max) {
      currentTeamIndex = (currentTeamIndex + 1) % fixedTeamNames.length;
      assignedTeamName = fixedTeamNames[currentTeamIndex];
    }

    // Добавляем игрока в команду
    teams[assignedTeamName].players.push(msg.chat.username || msg.chat.first_name);
    userRegistrations[chatId].joinedSolo = true;
    userRegistrations[chatId].teamName = assignedTeamName;

    // Отправляем уведомление
    const freeSpots = teams[assignedTeamName].max - teams[assignedTeamName].players.length;
    bot.sendPhoto(chatId, 'https://uploader-oss-mili.milaadfarzian.workers.dev/download/AgACAgIAAxkBAAIDHWmeM1PLLMMiFGX28-T5X-h8eWaGAAIwGWsbgX7xSNTyS_uDnAK_AQADAgADeQADOgQ/photos/file_4776.jpg', {
      caption: `Вы автоматически присоединились к команде "${assignedTeamName}"!\nОсталось мест: ${freeSpots}.\nЖдём вас ${tournamentDate} в ${tournamentTime}.`,
      parse_mode: 'Markdown'
    });

    // Если команда заполнилась — переходим к следующей для следующих игроков
    if (teams[assignedTeamName].players.length === teams[assignedTeamName].max) {
      currentTeamIndex = (currentTeamIndex + 1) % fixedTeamNames.length;
    }
  } else if (text === 'Пригласить друга') {
    if (!userRegistrations[chatId].joinedSolo && !userRegistrations[chatId].registeredTeam) {
      bot.sendMessage(chatId, 'Сначала зарегистрируйтесь в команде или создайте свою.');
      return;
    }
    bot.sendMessage(chatId, `Введите chat_id друга, которого хотите пригласить.\n\nЧтобы узнать chat_id:\n1. Напишите боту @userinfobot\n2. Отправьте любое сообщение боту\n3. В ответе вы увидите ваш ID — это и есть chat_id.`);
    userState[chatId] = 'awaiting_friend_id';
  } else if (text === 'Удалить команду') {
    const userData = userRegistrations[chatId];

    if (!userData.registeredTeam && !userData.joinedSolo) {
      bot.sendMessage(chatId, 'У вас нет зарегистрированной команды или участия в турнире.');
      return;
    }

    const teamName = userData.teamName;

    // Удаляем пользователя из команды
    if (teams[teamName]) {
      const playerIndex = teams[teamName].players.indexOf(msg.chat.username || msg.chat.first_name);
      if (playerIndex !== -1) {
        teams[teamName].players.splice(playerIndex, 1);
      }
      // Если команда стала пустой, удаляем её из хранилища
      if (teams[teamName].players.length === 0) {
        delete teams[teamName];
      }
    }

    // Обновляем данные пользователя
    userData.registeredTeam = false;
    userData.teamName = '';
    userData.joinedSolo = false;
    userData.confirmationCode = null;
    userData.confirmed = false;

    bot.sendMessage(chatId, 'Ваша регистрация успешно удалена. Теперь вы можете создать новую команду или участвовать в одиночку.');
  } else if (chatId === adminId && text.startsWith('/setdate ')) {
    const newDate = text.replace('/setdate ', '').trim();
    tournamentDate = newDate;
    bot.sendMessage(chatId, `Дата турнира успешно установлена: ${tournamentDate}`);
  } else if (chatId === adminId && text.startsWith('/settime ')) {
    const newTime = text.replace('/settime ', '').trim();
    tournamentTime = newTime;
    bot.sendMessage(chatId, `Время турнира успешно установлено: ${tournamentTime}`);
  } else if (text === 'Статистика') {
    const totalRegistered = Object.values(userRegistrations).filter(u => u.confirmed).length;
    const teamSpotsTotal = fixedTeamNames.reduce((sum, team) => sum + teams[team].max, 0);
    const teamSpotsTaken = fixedTeamNames.reduce((sum, team) => sum + teams[team].players.length, 0);

    bot.sendMessage(chatId, `
📊 Статистика турнира:
- Зарегистрировано участников: ${totalRegistered}
- Заполняемость команд: ${teamSpotsTaken}/${teamSpotsTotal} (${Math.round((teamSpotsTaken/teamSpotsTotal)*100)}%)
- Свободных мест: ${teamSpotsTotal - teamSpotsTaken}
    `);
  } else if (chatId === adminId && text === '/showteams') {
    const teamsList = Object.entries(teams).map(([team, data]) => {
      return `${team}: ${data.players.join(', ')} (${data.players.length}/${data.max})`;
    }).join('\n');

    if (teamsList) {
      bot.sendMessage(chatId, `Список команд:\n${teamsList}`);
    } else {
      bot.sendMessage(chatId, 'Нет зарегистрированных команд.');
    }
  } else if (chatId === adminId && text === '/showregistrations') {
    const registrationsList = Object.entries(userRegistrations).map(([chatId, data]) => {
      if (data.registeredTeam) {
        return `Чат ID: ${chatId} — в команде "${data.teamName}"`;
      } else if (data.joinedSolo) {
        return `Чат ID: ${chatId} — участвует в команде (автораспределение)`;
      } else {
        return `Чат ID: ${chatId} — не зарегистрирован`;
      }
    }).join('\n');

    if (registrationsList) {
      bot.sendMessage(chatId, `Список регистраций:\n${registrationsList}`);
    } else {
      bot.sendMessage(chatId, 'Нет данных о регистрациях.');
    }
  } else {
    bot.sendMessage(chatId, 'Неизвестный запрос. Используйте кнопки меню или введите корректную команду.');
  }
});

// Обработчик ошибок бота
bot.on('error', (error) => {
  console.error('Ошибка бота:', error);
});

// Дополнительная проверка целостности данных при старте (опционально)
function checkDataIntegrity() {
  Object.keys(userRegistrations).forEach(chatId => {
    const userData = userRegistrations[chatId];
    if (userData.registeredTeam && teams[userData.teamName]) {
      const playerName = userData.playerName || msg.chat.username || msg.chat.first_name;
      if (!teams[userData.teamName].players.includes(playerName)) {
        console.warn(`Пользователь ${chatId} зарегистрирован в команде "${userData.teamName}", но отсутствует в списке игроков.`);
      }
    }
  });
}

// Запускаем проверку при старте бота
checkDataIntegrity();

console.log('Бот запущен и готов к работе!');
