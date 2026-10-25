/* Ara tone consent helper. Loaded by the preview chat page. */
window.BokjaksoAraTone = (() => {
  const question = "괜찮으시면 저도 편하게 반말로 이야기해도 될까요? 🌸";
  const affirmative = /^(응+|어+|웅+|그래|좋아|좋지|괜찮아|반말해|편하게 해|해도 돼|물론|당연하지|네|예|오케이|ok|yes|응[\s,]+좋아|응[\s,]+그래)[.!~\s]*$/i;
  // Recognize everyday casual Korean endings; polite -요/-습니다 should not trigger.
  const informal = /(안녕|고마워|반가워|잘자|괜찮아|좋아|그래|맞아|몰라|알겠어|알았어|궁금해|힘들어|외로워|속상해|고민\s*있어|들어줘|말해줘|어떡해|뭐해|뭐야|했어|잤어|봤어|해줘|할까|볼까|있어|없어|하자|보자|하니|있니|어때|어디야|누구야)[.!?~\s]*$/;
  const requested = /반말.{0,12}(해줘|하자|해도|하기로|해봐)|편하게.{0,8}(말해|얘기해)/;
  const casualQuestion = /들어\s*줄래|해\s*줄래|말해\s*줄래|얘기\s*할래|고민\s*들어\s*줄래/;
  const explicitReminder = /반말.{0,15}(했잖아|하자고|하기로)|내\s*반말|나\s*반말/;
  function status(messages) {
    const i = messages.findIndex(m => m.role === "bot" && m.text.includes(question));
    if (i < 0) return messages.some(m => m.role === "user" && requested.test(m.text)) ? "casual" : "new";
    const answer = messages.slice(i+1).find(m => m.role === "user");
    if (!answer) return "pending";
    return affirmative.test(answer.text.trim()) || (requested.test(answer.text.trim()) || explicitReminder.test(answer.text.trim())) ? "casual" : "formal";
  }
  function handle(message, messages) {
    const state = status(messages);
    if (state === "new" && (informal.test(message.trim()) || casualQuestion.test(message.trim())) && !requested.test(message)) return {reply: "말씀해 주셔서 고마워요. " + question, state:"pending"};
    if (requested.test(message) || explicitReminder.test(message)) return {reply:"좋아, 이제 우리 편하게 이야기하자. 🌸 무슨 얘기부터 할까?",state:"casual"};
    if (state === "pending" && affirmative.test(message.trim())) return {reply:"좋아, 그럼 우리 편하게 이야기하자. 🌸 무슨 일이 있었어?",state};
    return {reply:null,state};
  }
  return {handle,status,question};
})();
