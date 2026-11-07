import re

path = 'tools/render_quizshow_v2_samples.ts'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

dataset_code = '''
const INDIA_GEOGRAPHY_DATASET: QuizDataset = {
  category: 'India',
  topic: 'India Geography Challenge',
  themeToken: 'QUIZ_GEOGRAPHY',
  accentColor: [6, 182, 212], // Oceanic Cyan
  sampleId: 'SF-QUIZ-V2-IND-6Q',
  outputFilename: 'quiz-v2-india-geography-6q.mp4',
  contactSheetFilename: 'india-geography-contact-sheet.png',
  questions: [
    {
      question: 'What is the highest mountain peak located in India?',
      options: ['Kanchenjunga', 'Nanda Devi', 'Kamet', 'Anamudi'],
      answerIndex: 0,
      answer: 'Kanchenjunga',
      explanation: 'Kanchenjunga in Sikkim reaches an elevation of 8,586 meters, making it the highest peak in India.',
      provenance: { source: 'Survey of India / Himalayan Registry' },
      image_path: 'data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/india_kanchenjunga_himalayas.png'
    },
    {
      question: 'Which river is revered as the longest and most sacred river in India?',
      options: ['Ganga', 'Godavari', 'Brahmaputra', 'Yamuna'],
      answerIndex: 0,
      answer: 'Ganga',
      explanation: 'The holy Ganges flows over 2,525 kilometers from the Gangotri glacier across Northern India.',
      provenance: { source: 'National River Conservation Directorate' },
      image_path: 'data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/india_ganga_river_varanasi.png'
    },
    {
      question: 'Which is the largest natural freshwater lake in India?',
      options: ['Wular Lake', 'Vembanad Lake', 'Chilika Lake', 'Loktak Lake'],
      answerIndex: 0,
      answer: 'Wular Lake',
      explanation: 'Wular Lake in Jammu and Kashmir is the largest natural freshwater lake in India, fed by the Jhelum river.',
      provenance: { source: 'Ministry of Jal Shakti Wetlands Registry' },
      image_path: 'data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/india_wular_lake_kashmir.png'
    },
    {
      question: 'What is the name of the southernmost geographic point of India?',
      options: ['Indira Point', 'Kanyakumari', 'Point Calimere', 'Dhanushkodi'],
      answerIndex: 0,
      answer: 'Indira Point',
      explanation: 'Indira Point on Great Nicobar Island marks the southernmost territorial frontier of India at 6 degrees North.',
      provenance: { source: 'National Hydrographic Office' },
      image_path: 'data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/india_indira_point_nicobar.png'
    },
    {
      question: 'Where is the only confirmed active volcano in India located?',
      options: ['Barren Island', 'Narcondam Island', 'Minicoy Island', 'Majuli Island'],
      answerIndex: 0,
      answer: 'Barren Island',
      explanation: 'Barren Island in the Andaman Sea is home to the only confirmed active volcano in South Asia.',
      provenance: { source: 'Geological Survey of India' },
      image_path: 'data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/india_barren_island_volcano.png'
    },
    {
      question: 'Which vast arid expanse forms the largest desert region in India?',
      options: ['Thar Desert', 'Spiti Cold Desert', 'Rann of Kutch', 'Deccan Arid Zone'],
      answerIndex: 0,
      answer: 'Thar Desert',
      explanation: 'The Great Indian Thar Desert covers over 200,000 square kilometers, predominantly across Rajasthan.',
      provenance: { source: 'Central Arid Zone Research Institute' },
      image_path: 'data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/india_thar_desert_dunes.png'
    }
  ]
};
'''

if 'INDIA_GEOGRAPHY_DATASET' not in text:
    insert_before = 'function getWorkspaceRoot(): string {'
    text = text.replace(insert_before, dataset_code + '\n' + insert_before)

# Update validation list in main()
old_validation = "if (!['all', 'geography', 'science'].includes(requested)) {"
new_validation = "if (!['all', 'geography', 'science', 'india'].includes(requested)) {"
text = text.replace(old_validation, new_validation)

old_usage = "Use: geography | science | all"
new_usage = "Use: geography | science | india | all"
text = text.replace(old_usage, new_usage)

# Update execution logic in main()
old_exec = """  const geoReceipt = requested === 'science' ? null : await renderDataset(GEOGRAPHY_DATASET, outputArtifactsDir);
  const sciReceipt = requested === 'geography' ? null : await renderDataset(SCIENCE_DATASET, outputArtifactsDir);"""

new_exec = """  const geoReceipt = (requested === 'all' || requested === 'geography') ? await renderDataset(GEOGRAPHY_DATASET, outputArtifactsDir) : null;
  const sciReceipt = (requested === 'all' || requested === 'science') ? await renderDataset(SCIENCE_DATASET, outputArtifactsDir) : null;
  const indReceipt = (requested === 'all' || requested === 'india') ? await renderDataset(INDIA_GEOGRAPHY_DATASET, outputArtifactsDir) : null;"""

text = text.replace(old_exec, new_exec)

# Update merge logic
old_merge = """  if (geoReceipt) mergedSamples.set(GEOGRAPHY_DATASET.category, sampleFor(GEOGRAPHY_DATASET, geoReceipt));
  if (sciReceipt) mergedSamples.set(SCIENCE_DATASET.category, sampleFor(SCIENCE_DATASET, sciReceipt));"""

new_merge = """  if (geoReceipt) mergedSamples.set(GEOGRAPHY_DATASET.category, sampleFor(GEOGRAPHY_DATASET, geoReceipt));
  if (sciReceipt) mergedSamples.set(SCIENCE_DATASET.category, sampleFor(SCIENCE_DATASET, sciReceipt));
  if (indReceipt) mergedSamples.set(INDIA_GEOGRAPHY_DATASET.category, sampleFor(INDIA_GEOGRAPHY_DATASET, indReceipt));"""

text = text.replace(old_merge, new_merge)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("SUCCESS: Added INDIA_GEOGRAPHY_DATASET to render_quizshow_v2_samples.ts")

