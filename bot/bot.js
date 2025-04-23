const { Botkit } = require('botkit')
const { SlackAdapter, SlackEventMiddleware } = require('botbuilder-adapter-slack')
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager')
const { api } = require('@pagerduty/pdjs');

const SCHEDULE_MAPPINGS = {
  team_name: { buisness: "321CBA", critical: ['ABC123'] },
};

const HELP_MESSAGE = 'Please provide a team name for the oncall engineers you would like to lookup. ' +
  'Example: `/oncall <team_name>` or `@oncall-bot <team_name>`. Allowed team names are: ' +
  `${Object.keys(SCHEDULE_MAPPINGS).map(schedule => `\`${schedule}\``).join(", ")}.`;

/**
 * Returns the secret string from Google Cloud Secret Manager
 * @param {string} name The name of the secret.
 * @return {string} The string value of the secret.
 */
async function accessSecretVersion(name) {
  const client = new SecretManagerServiceClient()
  const projectId = process.env.PROJECT_ID
  const secretName = `projects/${projectId}/secrets/${name}/versions/latest`;
  const [version] = await client.accessSecretVersion({ name: secretName });

  // Extract the payload as a string.
  const payload = version.payload.data.toString('utf8')

  return payload
}

async function handleSlackMessage(message, bot, pagerDuty) {
  // console.log("Message is:");
  // console.log(message);
  let messageText = message.text ? message.text.toLowerCase() : null;
  if (!messageText || messageText.includes("help") || SCHEDULE_MAPPINGS[messageText] == null) {
    await bot.reply(message, HELP_MESSAGE);
  } else {
    let teamSchedules = SCHEDULE_MAPPINGS[message.text.toLowerCase()].critical;
    let oncallEngineers = await Promise.all(
      teamSchedules.map(async (scheduleId, index) => {
        let engineer = await getOncallEngineer(pagerDuty, scheduleId);
        console.log(`The engineer for ${scheduleId} is ${engineer}`);

        var position = "";
        switch (index) {
          case 0:
            position = "Primary";
            break;
          case 1:
            position = "Secondary";
            break;
          case 2:
            position = "Tertiary";
            break;
          default:
            position = "Current";
            break;
        }
        return `*${position}*: ${engineer}`;
      })
    );

    let businessHoursSchedule = SCHEDULE_MAPPINGS[message.text.toLowerCase()].business;
    if (businessHoursSchedule) {
      // make the call to get the business hours engineer and add it to the front of the array
      let businessHoursEngineer = await getOncallEngineer(pagerDuty, businessHoursSchedule);
      console.log(`The business hours engineer for ${businessHoursSchedule} is ${businessHoursEngineer}`);
      oncallEngineers.unshift(`*Business Hours*: ${businessHoursEngineer}`);
    }

    await bot.reply(message, `*${message.text.toUpperCase()}* On Call Engineers - ${oncallEngineers.join(", ")}`);
  }
}

async function getOncallEngineer(pagerDuty, scheduleId) {
  let { _, resource } = await pagerDuty.get(`/oncalls?schedule_ids%5B%5D=${scheduleId}`);
  console.log("PagerDuty Response is: " + JSON.stringify(resource));
  if (resource.length == 0) {
    console.log("No oncall engineer found for scheduleId: " + scheduleId);
    return "Currently Off Duty";
  } else {
    console.log("Oncall engineer found for scheduleId: " + scheduleId);
    return resource[0].user.summary;
  }
}

/**
 * Asynchronous function to initialize kittenbot.
 */
async function initBot() {
  let pagerDutySecret = await accessSecretVersion('oncall-slack-bot-pager-duty-secret');
  const pagerDuty = api({ token: pagerDutySecret });

  const adapter = new SlackAdapter({
    clientSigningSecret: await accessSecretVersion('oncall-slack-bot-client-signing-secret'),
    botToken: await accessSecretVersion('oncall-slack-bot-token')
  })

  adapter.use(new SlackEventMiddleware())

  const controller = new Botkit({
    webhook_uri: '/api/messages',
    adapter: adapter
  })

  controller.ready(() => {
    controller.on('slash_command', async (bot, message) => {
      await handleSlackMessage(message, bot, pagerDuty);
    });

    // This works, but ends up causing a message storm, as the message the bot replies back with is causes another reply
    // unfortunately, the 'message' event type seems to be the only one that the bot will reply to :(
    controller.hears([new RegExp(/.*/)], ['direct_message', 'direct_mention', 'mention'], async (bot, message) => {
      await bot.reply(message, 'Meow. :smile_cat:');
    });
  });
}

initBot()
