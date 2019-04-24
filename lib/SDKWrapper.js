import Botmock from 'botmock';

export default class SDKWrapper {
  constructor(config = { debug: false, url: 'app' }) {
    this.config = config;
    this.token = process.env.BOTMOCK_TOKEN;
    this.args = [process.env.BOTMOCK_TEAM_ID, process.env.BOTMOCK_PROJECT_ID];
  }

  async init() {
    this.client = new Botmock({
      api_token: this.token,
      debug: this.config.debug,
      url: this.config.url
    });
    const { name } = await this.client.projects(...this.args);
    const { messages } = (await this.client.boards(
      ...this.args,
      process.env.BOTMOCK_BOARD_ID
    )).board;
    const intents = await this.client.intents(...this.args);
    const entities = await this.client.entities(...this.args);
    return { projectName: name, messages, intents, entities };
  }
}
