export type ToolGroup = 'Make' | 'Your computer' | 'Your Cloudflare' | 'Find' | 'Remember' | 'Time' | 'Voice';

export type CatalogTool = { readonly name: string; readonly title: string; readonly group: ToolGroup; readonly say: string };

export const TOOL_CATALOG: readonly CatalogTool[] = [
  { name: 'show_form', title: 'Shape the swarm', group: 'Make', say: 'Show me a 3D rocket.' },
  { name: 'imagine', title: 'Paint a picture', group: 'Make', say: 'Paint me a lighthouse at dusk.' },
  { name: 'show_widget', title: 'Live cards', group: 'Make', say: 'Give me a report on my Workers.' },
  { name: 'panels', title: 'Your panels', group: 'Make', say: 'Show my panels. Open the forecast again.' },
  { name: 'run_code', title: 'Scratch workbench', group: 'Make', say: 'Simulate a thousand coin flips.' },
  { name: 'terminal', title: 'Terminal', group: 'Your computer', say: 'Run node -v in my computer.' },
  { name: 'files', title: 'Files', group: 'Your computer', say: 'What files are in my workspace?' },
  { name: 'open_computer', title: 'Coding workspace', group: 'Your computer', say: 'Open my computer.' },
  { name: 'cloudflare', title: 'Cloudflare API', group: 'Your Cloudflare', say: 'How many Workers do I have?' },
  { name: 'web_search', title: 'Web search', group: 'Find', say: 'Search the web for Workers news.' },
  { name: 'browse', title: 'Browse a page', group: 'Find', say: 'Open developers.cloudflare.com.' },
  { name: 'look_up', title: 'Look it up', group: 'Find', say: 'Who painted the Starry Night?' },
  { name: 'look', title: 'Look through the camera', group: 'Find', say: 'What am I holding?' },
  { name: 'remember', title: 'Remember', group: 'Remember', say: 'Remember I take my coffee black.' },
  { name: 'forget', title: 'Forget', group: 'Remember', say: 'Forget my coffee order.' },
  { name: 'set_timer', title: 'Timers', group: 'Time', say: 'Set a timer for five minutes.' },
  { name: 'cancel_timer', title: 'Cancel a timer', group: 'Time', say: 'Cancel the tea timer.' },
  { name: 'change_voice', title: 'Change voice', group: 'Voice', say: 'Switch to a deeper voice.' },
  { name: 'rest', title: 'Sleep', group: 'Voice', say: 'That is all, thanks.' },
  { name: 'routines', title: 'Routines', group: 'Voice', say: 'Every morning at 8, tell me about my workers.' },
  { name: 'instructions', title: 'Your instructions', group: 'Voice', say: 'From now on, keep answers to one sentence.' },
  { name: 'capabilities', title: 'What I can do', group: 'Voice', say: 'What can you do?' },
  { name: 'mcp', title: 'Your MCP servers', group: 'Find', say: 'What can my docs server do?' },
];

export const TOOL_GROUPS: readonly ToolGroup[] = ['Make', 'Your computer', 'Your Cloudflare', 'Find', 'Remember', 'Time', 'Voice'];
