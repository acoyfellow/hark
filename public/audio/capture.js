const TARGET_RATE = 16000;
const FRAME = 1280;
const LEVEL_EVERY = 6;

class HarkCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.position = -1;
    this.previous = 0;
    this.frame = new Int16Array(FRAME);
    this.filled = 0;
    this.blocks = 0;
    this.peak = 0;
    this.open = true;
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'mute') this.open = !event.data.on;
    };
  }

  push(sample) {
    const clamped = Math.max(-1, Math.min(1, sample));

    this.frame[this.filled] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    this.filled += 1;

    if (this.filled === FRAME) {
      if (this.open) {
        const out = this.frame;

        this.port.postMessage({ type: 'pcm', buffer: out.buffer }, [out.buffer]);
      }

      this.frame = new Int16Array(FRAME);
      this.filled = 0;
    }
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];

    if (!channel) return true;

    let energy = 0;

    for (let index = 0; index < channel.length; index += 1) energy += channel[index] * channel[index];

    const at = (index) => (index < 0 ? this.previous : channel[index]);

    while (this.position < channel.length - 1) {
      const base = Math.floor(this.position);
      const fraction = this.position - base;
      const left = at(base);

      this.push(left + (at(base + 1) - left) * fraction);
      this.position += this.ratio;
    }

    this.position -= channel.length;
    this.previous = channel[channel.length - 1];

    const rms = Math.sqrt(energy / channel.length);

    this.peak = Math.max(this.peak * 0.85, rms);
    this.blocks += 1;

    if (this.blocks % LEVEL_EVERY === 0) this.port.postMessage({ type: 'level', value: this.peak });

    return true;
  }
}

registerProcessor('hark-capture', HarkCapture);
