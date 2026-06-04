const fs = require('fs');

const translations = {
  'ru.json': 'Пожалуйста, протестируйте API-соединение перед сохранением',
  'es.json': 'Por favor, prueba la conexión de API antes de guardar',
  'uk.json': 'Будь ласка, протестуйте API-з\'єднання перед збереженням',
  'pt.json': 'Por favor, teste a conexão da API antes de salvar',
  'fr.json': 'Veuillez tester la connexion API avant de sauvegarder',
  'de.json': 'Bitte testen Sie die API-Verbindung vor dem Speichern',
  'it.json': 'Si prega di testare la connessione API prima di salvare',
  'tr.json': 'Lütfen kaydetmeden önce API bağlantısını test edin'
};

Object.entries(translations).forEach(([file, translation]) => {
  const path = `src/locales/${file}`;
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(
    /"api_test_required": "Please test the API connection before saving"/,
    `"api_test_required": "${translation}"`
  );
  fs.writeFileSync(path, content);
});

console.log('Translations updated!');
