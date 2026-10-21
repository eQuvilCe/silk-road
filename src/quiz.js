// "Which Silk Road good are you?" — five quick questions, six possible answers,
// a result card with a photo that turns over into place, and a share button.
export const QUIZ = [
  { q: 'Pick a place to spend the night.', a: [['A desert camp under the stars', 'horses'], ['The library of the House of Wisdom', 'ideas'], ['A bazaar full of colour', 'silk'], ['A courtyard full of musicians', 'music']] },
  { q: 'A sandstorm stops the caravan. You…', a: [['Wait calmly and write it all down', 'paper'], ['Gallop straight through it', 'horses'], ['Invent a better route', 'ideas'], ['Make a very loud noise at it', 'gunpowder']] },
  { q: 'Choose a souvenir.', a: [['A silk scarf', 'silk'], ['A hand-bound notebook', 'paper'], ['A lute', 'music'], ['Fireworks', 'gunpowder']] },
  { q: 'Your friends call you…', a: [['Elegant', 'silk'], ['Fast', 'horses'], ['Clever', 'ideas'], ['Explosive', 'gunpowder']] },
  { q: 'Your superpower:', a: [['Everyone wants you', 'silk'], ['You remember everything', 'paper'], ['You never get tired', 'horses'], ['You make people dance', 'music']] },
];
export const RESULTS = {
  silk: { title: 'Silk', img: 'cocoons.jpg', text: 'Everybody wants you and nobody knows how you are made. Rome paid in gold for you.' },
  paper: { title: 'Paper', img: 'paper.jpg', text: 'Quiet and patient — and you changed everything. Without you: no books, no maps, no receipts.' },
  horses: { title: 'A heavenly horse', img: 'horse.jpg', text: 'Fast, proud and worth a war. Emperors sent whole armies to bring you home.' },
  music: { title: 'Music', img: 'pipa.jpg', text: 'You travel lightest of all and arrive everywhere. Every city on the road learned your tune.' },
  ideas: { title: 'An idea', img: 'library.jpg', text: 'You crossed the deserts with no luggage at all — numbers, stories, medicine, stars.' },
  gunpowder: { title: 'Gunpowder', img: 'gunpowder.jpg', text: 'Invented as medicine, famous as fireworks. Handle with care.' },
};

export function buildQuiz(root, t = (s) => s) {
  const stage = root.querySelector('[data-quiz-stage]');
  const bar = root.querySelector('[data-quiz-bar]');
  let step = 0;
  let score = {};

  function question() {
    const item = QUIZ[step];
    bar.style.transform = `scaleX(${step / QUIZ.length})`;
    stage.innerHTML = `
      <div class="qz-card">
        <p class="qz-count">${String(step + 1).padStart(2, '0')} / ${String(QUIZ.length).padStart(2, '0')}</p>
        <h3 class="qz-q">${t(item.q)}</h3>
        <div class="qz-answers">
          ${item.a.map(([label, key], i) => `<button type="button" class="qz-a" style="--i:${i}" data-k="${key}"><span>${'ABCD'[i]}</span>${t(label)}</button>`).join('')}
        </div>
      </div>`;
    stage.querySelectorAll('.qz-a').forEach((b) =>
      b.addEventListener('click', () => {
        score[b.dataset.k] = (score[b.dataset.k] || 0) + 1;
        b.classList.add('picked');
        stage.querySelector('.qz-card').classList.add('leave');
        setTimeout(() => {
          step++;
          step < QUIZ.length ? question() : result();
        }, 520);
      })
    );
  }

  function result() {
    bar.style.transform = 'scaleX(1)';
    const key = Object.entries(score).sort((a, b) => b[1] - a[1])[0][0];
    const r = RESULTS[key];
    stage.innerHTML = `
      <div class="qz-result">
        <div class="qz-photo"><img src="photos/${r.img}" alt="" /></div>
        <div class="qz-res-text">
          <p class="qz-count">${t('You are')}</p>
          <h3 class="qz-title">${t(r.title)}</h3>
          <p class="qz-desc">${t(r.text)}</p>
          <div class="qz-btns">
            <button type="button" class="btn" data-qz-share>${t('Share my result')}</button>
            <button type="button" class="btn" data-qz-again>${t('Try again')}</button>
          </div>
        </div>
      </div>`;
    stage.querySelector('[data-qz-again]').addEventListener('click', () => {
      step = 0;
      score = {};
      question();
    });
    stage.querySelector('[data-qz-share]').addEventListener('click', async (e) => {
      const text = `${t('On the Silk Road I am')} ${t(r.title)} — ${location.href.split('#')[0]}`;
      try {
        if (navigator.share) await navigator.share({ title: 'Silk Road 2.0', text });
        else {
          await navigator.clipboard.writeText(text);
          e.currentTarget.textContent = t('Copied');
        }
      } catch {}
    });
  }

  question();
}
