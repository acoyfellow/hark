type FeatureStatus = 'tested' | 'works' | 'todo';

type Feature = { readonly name: string; readonly line: string; readonly status: FeatureStatus };

export type FeatureGroup = { readonly title: string; readonly features: readonly Feature[] };

export const FEATURES: readonly FeatureGroup[] = [
  {
    title: 'Voice',
    features: [
      { name: 'Just talk', line: 'Tap once. No chat box, no push-to-talk.', status: 'tested' },
      { name: 'Talk over it', line: 'Interrupt anytime. It stops and listens.', status: 'tested' },
      { name: 'Never hears itself', line: 'An echo gate drops its own voice from the mic.', status: 'tested' },
      { name: 'One mic prompt', line: 'Asked once per call, never again on reconnect.', status: 'tested' },
      { name: 'Says goodbye', line: 'Say "that is all" and it sleeps and closes the mic.', status: 'tested' },
      { name: 'Does what it says', line: 'When it says it will do something, it does it in the same turn.', status: 'todo' },
      { name: 'Stays on task', line: 'A goal is kept every turn, so long jobs finish.', status: 'todo' },
    ],
  },
  {
    title: 'Your Cloudflare',
    features: [
      { name: 'Sign in with Cloudflare', line: 'Your account, your token. It never leaves your Durable Object.', status: 'tested' },
      { name: 'Your own inference', line: 'Every model call runs on your Workers AI.', status: 'tested' },
      { name: 'Every scope, only AI required', line: 'Grant as much or as little as you like.', status: 'todo' },
      { name: 'Ask about your account', line: '"How many Workers do I have?"', status: 'works' },
      { name: 'Do it on your account', line: '"Deploy a hello world Worker." Confirmed by voice first.', status: 'todo' },
    ],
  },
  {
    title: 'Your computer',
    features: [
      { name: 'A durable Linux box', line: 'node, git, npm, wrangler and the internet. One per person.', status: 'tested' },
      { name: 'Terminal cards', line: 'Run a command and see the output beside the swarm.', status: 'tested' },
      { name: 'Files that stay', line: 'Your workspace survives restarts.', status: 'works' },
      { name: 'Search the web', line: 'Answers with sources you can open.', status: 'works' },
      { name: 'Browse a page', line: 'A screenshot of any URL, on Browser Rendering.', status: 'works' },
      { name: 'AI Search', line: 'Search your own indexed content.', status: 'todo' },
    ],
  },
  {
    title: 'It makes things',
    features: [
      { name: 'Ember swarm', line: 'Thousands of particles that shape into what you ask for.', status: 'tested' },
      { name: '3D models', line: 'A rocket, a robot, a guitar, sculpted live in three.js.', status: 'tested' },
      { name: 'Little movies', line: 'A seed that sprouts, a countdown into fireworks.', status: 'tested' },
      { name: 'Paintings', line: 'Real images, only when you ask for a picture.', status: 'tested' },
      { name: 'Live cards', line: 'Reports, alerts, tables and charts.', status: 'tested' },
      { name: 'three.js first', line: 'It builds before it paints.', status: 'todo' },
      { name: 'A resting shape', line: '"Stay as a star." It loops whatever you like.', status: 'works' },
    ],
  },
  {
    title: 'Panels',
    features: [
      { name: 'History drawer', line: 'Every panel this session, on the side. Tap to bring one back.', status: 'todo' },
      { name: 'Manage by voice', line: '"What is open?" "Close the terminal." "Go back."', status: 'todo' },
      { name: 'Big or small', line: '"Make that full screen." "Shrink it."', status: 'todo' },
    ],
  },
  {
    title: 'It knows you',
    features: [
      { name: 'Remembers', line: 'Facts you share stay between calls.', status: 'tested' },
      { name: 'Timers', line: 'Durable alarms that speak when they end.', status: 'tested' },
      { name: 'Push notifications', line: 'A timer or a finished job reaches your phone, even with hark closed.', status: 'todo' },
      { name: 'Looks through your camera', line: 'One frame, only when you ask.', status: 'tested' },
      { name: 'Your own MCP servers', line: '"Connect my server" and its tools are yours by voice.', status: 'works' },
      { name: 'See all your tools', line: 'A list on the side, so you know what to ask for.', status: 'todo' },
      { name: 'Tells you what it can do', line: '"What can you do?" gets a spoken list and a card.', status: 'todo' },
      { name: 'Edits itself', line: '"Use a faster brain." "Switch to a deeper voice."', status: 'todo' },
      { name: 'Your own prompt', line: 'Change how it talks and what it cares about.', status: 'todo' },
      { name: 'See its context', line: 'What it is thinking with, at a glance.', status: 'todo' },
    ],
  },
];
