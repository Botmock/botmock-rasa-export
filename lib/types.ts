export namespace Rasa {
  export enum SlotTypes {
    text = "text",
  }
  export type Template = { [actionName: string]: { [type: string]: any; }; };
  export enum TemplateTypes {
    TEXT = "text",
    IMAGE = "image",
    BUTTONS = "buttons",
  }
}

export namespace Botmock {
  export interface Message {
    message_id: string;
    message_type: string;
    previous_message_ids: any[];
    next_message_ids: any[];
    is_root: boolean;
    payload: Partial<{
      workflow_index: number;
      nodeName: string;
      context: [];
      elements: [];
      text: string;
      quick_replies: any[];
      buttons: any[];
      selectedResult: any;
      image_url: string;
    }>;
  };
  export enum JumpTypes {
    node = "node",
    project = "project",
  }
  export enum MessageTypes {
    GENERIC = "generic",
    DELAY = "delay",
    JUMP = "jump",
    WEBVIEW = "webview",
    IMAGE = "image",
    BUTTON = "button",
    QUICK_REPLIES = "quick_replies",
  }
}
