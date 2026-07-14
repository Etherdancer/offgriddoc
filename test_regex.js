const patterns = [
  // 1. Place of birth
  /\b(?:mjesto ro[đd]enja|place of birth|geburtsort|lieu de naissance|lugar de nacimiento|luogo di nascita)\s*:\s*(.*?)(?=\s*[A-Za-zŽĆČĐŠžćčđš]+\s*:|$)/gi,
  
  // 2. Citizenship / Nationality
  /\b(?:dr[žz]avljanstvo|nacionalnost|citizenship|nationality|staatsangeh[öo]rigkeit|nationalit[ée]|nacionalidad|cittadinanza)\s*:\s*(.*?)(?=\s*[A-Za-zŽĆČĐŠžćčđš]+\s*:|$)/gi,
  
  // 3. Gender / Sex
  /\b(?:spol|gender|sex|geschlecht|sexe|g[ée]nero|sesso)\s*:\s*(.*?)(?=\s*[A-Za-zŽĆČĐŠžćčđš]+\s*:|$)/gi,
  
  // 4. Name
  /\b(?:ime i prezime|full name|name|nom|nombre|nome|first name|last name|ime|prezime)\s*:\s*(.*?)(?=\s*[A-Za-zŽĆČĐŠžćčđš]+\s*:|$)/gi,
  
  // 5. Address / Residence
  /\b(?:adresa|address|adresse|direcci[óo]n|indirizzo|prebivali[šs]te|boravi[šs]te)\s*:\s*(.*?)(?=\s*[A-Za-zŽĆČĐŠžćčđš]+\s*:|$)/gi
];

const text = "Mjesto rođenja: Zagreb, Hrvatska OIB: 12345 Državljanstvo: hrvatsko Ime: Tomislav Rušnjak Adresa: Ilirskog pokreta 5, Bjelovar Spol: Muško";

patterns.forEach((p, i) => {
  let m;
  while ((m = p.exec(text)) !== null) {
    console.log(`Pattern ${i+1}: ${m[1].trim()}`);
  }
});