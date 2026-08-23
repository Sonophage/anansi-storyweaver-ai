import type { Input, Entry } from '../src/context.ts';
const e = (id: string, body: string, o: Partial<Entry> = {}): Entry => ({
  id, title: id, body, entryType: 'character', activation: 'always_on',
  keys: [], lastEditor: 'human', ...o,
});

export const input: Input = {
  story: {
    title: 'The Silver Key', genre: 'fantasy noir',
    premise: 'A broke ex-sergeant owes a moneylender more than he can pay, and the only thing he owns outright is a key he was told never to sell.',
    setting: 'Vantic, a canal city, in the third week of rain',
    pov: 'third limited, past tense',
    writingStyle: 'clipped and wet. Short sentences. Weather does the feeling. No adverbs on dialogue tags.',
    spice: 2,
    direction: 'Aldis gives up the key and keeps the debt.',
  },
  chapters: [
    { id: 'c1', index: 1, title: 'Short', summary: 'Aldis borrows from Marek against the key. Marek does not ask what it opens.' },
    { id: 'c2', index: 2, title: 'Water', summary: 'The lower archive floods. Aldis learns the vault is below the waterline.' },
    { id: 'c3', index: 3, title: 'The Bell', authorsNote: 'Aldis must be forced to take the key out of his coat.' },
  ],
  passages: [
    { id: 'p1', ordinal: 1, body: 'The rain had not stopped for three days. Aldis Fen stood under the fishmonger\'s awning and watched Marek\'s man cross the bridge, unhurried, the way men walk when they know where you sleep.' },
    { id: 'p2', ordinal: 2, body: 'He had counted the coins twice that morning. He counted them again now, in his pocket, by feel. The number did not improve.' },
    { id: 'p3', ordinal: 3, body: '"Marek says the bell," the man said. He did not look at Aldis when he said it. "He says you\'ll know what that means."' },
  ],
  entries: [
    e('e-aldis', '[Aldis Fen: 34, ex-Watch sergeant, limp in the left knee from a fall he lies about, owes Marek eleven crowns]'),
    e('e-key', '[the Silver Key: brass, not silver, despite the name. Cold to the touch even in summer. Opens the lower archive vault. Aldis carries it sewn into his coat lining]',
      { entryType: 'item', activation: 'triggered', keys: ['key', 'coat'] }),
    e('e-marek', '[Marek Vale: moneylender, courteous, never raises his voice, has never once been seen outside in the rain]',
      { entryType: 'character' }),
    e('e-rule', '[Vantic law: a debt survives the debtor. It passes to whoever shares his name]', { entryType: 'rule' }),
  ],
  mode: 'direct',
  directive: 'Marek\'s man makes it clear the debt is due tonight, and Aldis reaches into his coat.',
  currentChapter: { id: 'c3', index: 3, title: 'The Bell', authorsNote: 'Aldis must be forced to take the key out of his coat.' },
  budget: 0,
  tailTokens: 220,
};

