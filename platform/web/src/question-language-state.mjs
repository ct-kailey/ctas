export const QUESTION_LANGUAGES = Object.freeze({ ko: '한국어', en: 'English' });

export function questionLanguage(value) {
  return Object.hasOwn(QUESTION_LANGUAGES, value) ? value : null;
}

export function canUseQuestionTranslation(question, translation) {
  return Boolean(translation?.status === 'draft'
    && translation.source_question_version === question.version
    && questionLanguage(translation.language)
    && ['draft', 'waiting', 'answered_pending'].includes(question.status));
}

export function translationAttemptState(items, pending, selected) {
  const active = items.some(item => item.status === 'running');
  const priorAttempt = pending ? items.find(item => item.id === pending.request_id) : selected;
  return { active, retryable: !active && ['failed', 'uncertain'].includes(priorAttempt?.status) };
}

export function questionMessageDraft(question, translation) {
  const translated = canUseQuestionTranslation(question, translation) ? translation : null;
  const language = questionLanguage(translated?.language || question.language) || 'ko';
  // Customer-facing dates follow the selected content language, never UI locale.
  const formatDate = value => new Date(value).toLocaleString(language === 'en' ? 'en-US' : 'ko-KR', { timeZone: 'Asia/Seoul' });
  const title = translated?.title || question.title;
  if (question.status === 'resolved') return {
    subject: title,
    body: language === 'en'
      ? `Hello. Here is the confirmed outcome regarding ${title}.\n\n${question.answer?.text || ''}\n\nReview notes: ${question.resolution?.reason || ''}`
      : `안녕하세요. ${title} 관련 확인 결과를 안내드립니다.\n\n${question.answer?.text || ''}\n\n검토 의견: ${question.resolution?.reason || ''}`,
  };
  const text = translated?.question || question.question;
  return {
    subject: title,
    body: language === 'en'
      ? `Hello. Could you please confirm the following?\n\n${text}${question.due_at ? `\n\nRequested response date: ${formatDate(question.due_at)}` : ''}`
      : `안녕하세요. 아래 사항을 확인 부탁드립니다.\n\n${text}${question.due_at ? `\n\n답변 요청 기한: ${formatDate(question.due_at)}` : ''}`,
    ...(translated ? { translation_id: translated.id } : {}),
  };
}
