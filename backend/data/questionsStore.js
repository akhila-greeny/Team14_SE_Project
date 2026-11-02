// OIPP-F-014: interview question bank.
// Temporary in-memory storage, same approach as drivesStore.js.
// Later this file will be replaced by PostgreSQL queries.
const questions = [
  { id: 1, company: 'Infosys', topic: 'Aptitude', question: 'A train 150 m long crosses a pole in 15 seconds. What is its speed in km/h?' },
  { id: 2, company: 'Infosys', topic: 'Technical', question: 'What is the difference between an abstract class and an interface in Java?' },
  { id: 3, company: 'Infosys', topic: 'HR', question: 'Why do you want to join Infosys?' },
  { id: 4, company: 'Google', topic: 'Data Structures', question: 'Find the length of the longest substring without repeating characters.' },
  { id: 5, company: 'Google', topic: 'Algorithms', question: 'Given a sorted array rotated at an unknown pivot, search for a target in O(log n).' },
  { id: 6, company: 'Google', topic: 'System Design', question: 'How would you design a URL shortener?' },
  { id: 7, company: 'TCS', topic: 'Technical', question: 'Explain normalization in DBMS and the first three normal forms.' },
  { id: 8, company: 'TCS', topic: 'Coding', question: 'Write a program to check whether a string is a palindrome.' },
  { id: 9, company: 'TCS', topic: 'HR', question: 'Are you willing to relocate to any TCS location?' },
];

// Returns all questions, or only those for the given company (case-insensitive).
function listQuestions(company) {
  if (!company || !company.trim()) return questions;
  const wanted = company.trim().toLowerCase();
  return questions.filter((q) => q.company.toLowerCase() === wanted);
}

module.exports = { listQuestions };
