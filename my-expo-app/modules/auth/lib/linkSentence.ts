// İçinde bağlantı olan cümleyi dil başına doğru sırayla kurmak için: çeviri
// "{link}" yer tutucusu taşır ("I have read the {link} and …" / "{link}’nı okudum …"),
// bağlantının önü ve arkası ayrı parçalar olarak döner. Türkçe ek ("’nı") ile
// bağlantıyı ayrı ayrı çevirmek mümkün olmadığı için onay satırları yarı Türkçe kalıyordu.

export function splitLinkSentence(sentence: string): [before: string, after: string] {
  const i = sentence.indexOf('{link}');
  if (i < 0) return ['', ` ${sentence}`];
  return [sentence.slice(0, i), sentence.slice(i + '{link}'.length)];
}
