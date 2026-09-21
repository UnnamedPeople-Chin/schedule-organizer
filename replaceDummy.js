const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

const replacement = `
function generateDynamicDummyData() {
    const schedules = [];
    const todos = [];
    const now = new Date();
    
    const year = now.getFullYear();
    const currentMonth = now.getMonth();
    
    const categories = ['personal', 'meeting', 'review'];
    const tags = ['Internal', 'Meeting', 'Review', 'Eksternal'];
    const locations = ['Ruang Meeting A', 'Zoom Meeting', 'Ruang Desain', 'Auditorium', 'Kafe'];
    
    const scheduleTitles = ['Briefing Pagi', 'Rapat Tim Proyek', 'Review Desain', 'Diskusi Client', 'Kerja Mandiri', 'Laporan Bulanan', 'Evaluasi Kinerja', 'Sesi Brainstorming', 'Pengembangan Fitur', 'Testing Aplikasi'];
    const todoTitles = ['Menyelesaikan laporan progress', 'Kirim email ke klien', 'Review kode pull request', 'Buat dokumentasi API', 'Update status project', 'Siapkan materi presentasi', 'Backup file penting', 'Perbaiki bug UI', 'Diskusi desain baru'];
    
    let schedId = 1;
    let todoId = 1;
    
    for (let m = 0; m < 2; m++) {
        let targetMonth = currentMonth + m;
        let targetYear = year;
        if (targetMonth > 11) {
            targetMonth -= 12;
            targetYear += 1;
        }
        
        const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        
        for (let d = 1; d <= daysInMonth; d++) {
            // Generate 1-4 schedules per day randomly
            const numSchedules = Math.floor(Math.random() * 4) + 1;
            
            for(let s=0; s<numSchedules; s++) {
                const dateStr = \`\${targetYear}-\${String(targetMonth + 1).padStart(2, '0')}-\${String(d).padStart(2, '0')}\`;
                const startHour = 7 + Math.floor(Math.random() * 9); // between 7 and 15
                const endHour = startHour + 1 + Math.floor(Math.random() * 3); // 1 to 3 hours duration
                
                schedules.push({
                    id: 'dsched-' + schedId++,
                    title: scheduleTitles[Math.floor(Math.random() * scheduleTitles.length)],
                    date: dateStr,
                    startTime: \`\${String(startHour).padStart(2, '0')}:00\`,
                    endTime: \`\${String(endHour).padStart(2, '0')}:00\`,
                    category: categories[Math.floor(Math.random() * categories.length)],
                    location: locations[Math.floor(Math.random() * locations.length)],
                    description: 'Agenda otomatis ter-generate',
                    status: targetMonth === currentMonth && d < now.getDate() ? 'selesai' : (targetMonth === currentMonth && d === now.getDate() ? 'berlangsung' : 'akan_datang'),
                    tag: tags[Math.floor(Math.random() * tags.length)]
                });
            }
            
            // Generate 1-3 todos per day
            const numTodos = Math.floor(Math.random() * 3) + 1;
            for(let t=0; t<numTodos; t++) {
                const dateStr = \`\${targetYear}-\${String(targetMonth + 1).padStart(2, '0')}-\${String(d).padStart(2, '0')}\`;
                const dayName = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][new Date(targetYear, targetMonth, d).getDay()];
                
                todos.push({
                    id: 'dtodo-' + todoId++,
                    title: todoTitles[Math.floor(Math.random() * todoTitles.length)],
                    day: dayName,
                    date: dateStr,
                    priority: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)],
                    completed: targetMonth === currentMonth && d < now.getDate() ? true : false
                });
            }
        }
    }
    
    return { schedules, todos };
}

const dynamicData = generateDynamicDummyData();
const figmaMockSchedules = dynamicData.schedules;
const figmaMockTodos = dynamicData.todos;
\n\n`;

const startMarker = 'const figmaMockSchedules = [';
const endMarker = '// LocalStorage helpers';

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
    code = code.substring(0, startIndex) + replacement + code.substring(endIndex);
    
    // Also update state initialization to current date
    code = code.replace(/selectedMonth:\s*\d+,.*$/m, `selectedMonth: new Date().getMonth(), // Dynamic to current month`);
    code = code.replace(/selectedYear:\s*\d+,.*$/m, `selectedYear: new Date().getFullYear(), // Dynamic to current year`);
    
    // Also update loadFromStorage defaults
    code = code.replace(/parsed\.selectedMonth !== undefined \? parsed\.selectedMonth : \d+;/g, `parsed.selectedMonth !== undefined ? parsed.selectedMonth : new Date().getMonth();`);
    code = code.replace(/parsed\.selectedYear \|\| \d+;/g, `parsed.selectedYear || new Date().getFullYear();`);
    
    fs.writeFileSync('app.js', code);
    console.log('Successfully replaced dummy data!');
} else {
    console.log('Could not find boundaries.');
}
