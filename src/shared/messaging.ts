import { GameResult, RoadAnalysis } from '../roads/types';
import { Prediction } from '../roads/prediction';

/** Message types for communication between extension components */
export type Message =
  | { type: 'RESULTS_DETECTED'; results: GameResult[] }
  | { type: 'REQUEST_ANALYSIS'; results: GameResult[] }
  | { type: 'ANALYSIS_RESULT'; analysis: RoadAnalysis; prediction: Prediction | null }
  | { type: 'DETECTION_STATUS'; status: 'scanning' | 'found' | 'not_found' | 'watching' }
  | { type: 'GET_STATE' }
  | { type: 'STATE_UPDATE'; results: GameResult[]; status: string };

/** Send a message to the background service worker */
export function sendToBackground(message: Message): Promise<Message> {
  return chrome.runtime.sendMessage(message);
}

/** Send a message to the active tab's content script */
export async function sendToContent(tabId: number, message: Message): Promise<void> {
  await chrome.tabs.sendMessage(tabId, message);
}

/** Listen for messages */
export function onMessage(
  handler: (message: Message, sender: chrome.runtime.MessageSender) => Promise<Message | void> | void,
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const result = handler(message as Message, sender);
    if (result instanceof Promise) {
      result.then(sendResponse);
      return true; // Keep channel open for async response
    }
  });
}
