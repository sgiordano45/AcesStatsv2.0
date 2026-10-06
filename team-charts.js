/**
 * Team Charts Module for Men's Softball League Website
 * Vanilla JavaScript version - no external dependencies
 * @version 1.0.0
 * @author League Development Team
 */

class TeamCharts {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            width: options.width || 800,
            height: options.height || 400,
            margin: options.margin || { top: 40, right: 40, bottom: 90, left: 60 },
            colors: options.colors || ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe', '#43e97b', '#38f9d7'],
            animation: options.animation !== false,
            responsive: options.responsive !== false
        };
        
        this.data = null;
        this.currentChart = null;
        this.tooltip = null;
        
        this.init();
    }

    init() {
        this.createTooltip();
        if (this.options.responsive) {
            this.setupResizeHandler();
        }
    }

    createWinsChart(teams, options = {}) {
        const config = { ...this.options, ...options };
        const sortedTeams = [...teams].sort((a, b) => (b.wins || 0) - (a.wins || 0));
        
        const { chartWidth, chartHeight, margin } = this.calculateDimensions(config);
        const maxWins = Math.max(...sortedTeams.map(t => t.wins || 0), 1);
        const barWidth = chartWidth / sortedTeams.length * 0.8;
        const spacing = chartWidth / sortedTeams.length * 0.2;
        
        this.container.innerHTML = '';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', config.width);
        svg.setAttribute('height', config.height);
        svg.style.background = 'white';
        svg.style.borderRadius = '8px';
        
        const chartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        chartGroup.setAttribute('transform', `translate(${margin.left}, ${margin.top})`);
        svg.appendChild(chartGroup);
        
        this.addAxes(chartGroup, chartWidth, chartHeight);
        this.addYAxisLabels(chartGroup, chartHeight, maxWins, 'wins');
        
        sortedTeams.forEach((team, index) => {
            const x = index * (barWidth + spacing) + spacing/2;
            const barHeight = ((team.wins || 0) / maxWins) * chartHeight;
            const y = chartHeight - barHeight;
            const color = config.colors[index % config.colors.length];
            
            const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            bar.setAttribute('class', 'bar');
            bar.setAttribute('x', x);
            bar.setAttribute('width', barWidth);
            bar.setAttribute('fill', color);
            bar.style.cursor = 'pointer';
            bar.style.transition = 'opacity 0.3s ease';
            
            if (config.animation) {
                bar.setAttribute('y', chartHeight);
                bar.setAttribute('height', 0);
                setTimeout(() => {
                    bar.style.transition = 'all 0.8s ease';
                    bar.setAttribute('y', y);
                    bar.setAttribute('height', barHeight);
                }, index * 100);
            } else {
                bar.setAttribute('y', y);
                bar.setAttribute('height', barHeight);
            }
            
            bar.addEventListener('mouseover', (event) => {
                this.showTooltip(event, team.name, `${team.wins || 0} wins`);
                bar.style.opacity = '0.8';
            });
            bar.addEventListener('mouseout', () => {
                this.hideTooltip();
                bar.style.opacity = '1';
            });
            
            chartGroup.appendChild(bar);
        });
        
        this.addTeamLabels(chartGroup, sortedTeams, barWidth, spacing, chartHeight);
        this.addAxisLabels(chartGroup, chartWidth, chartHeight, 'Teams', 'Wins');
        
        this.container.appendChild(svg);
        this.currentChart = 'wins';
    }

    createBattingChart(teams, options = {}) {
        const config = { ...this.options, ...options };
        const sortedTeams = [...teams].sort((a, b) => (b.batting_avg || 0) - (a.batting_avg || 0));
        
        const { chartWidth, chartHeight, margin } = this.calculateDimensions(config);
        const maxAvg = Math.max(...sortedTeams.map(t => t.batting_avg || 0), 0.1);
        const barWidth = chartWidth / sortedTeams.length * 0.8;
        const spacing = chartWidth / sortedTeams.length * 0.2;
        
        this.container.innerHTML = '';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', config.width);
        svg.setAttribute('height', config.height);
        svg.style.background = 'white';
        svg.style.borderRadius = '8px';
        
        const chartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        chartGroup.setAttribute('transform', `translate(${margin.left}, ${margin.top})`);
        svg.appendChild(chartGroup);
        
        this.addAxes(chartGroup, chartWidth, chartHeight);
        this.addYAxisLabels(chartGroup, chartHeight, maxAvg, 'batting');
        
        sortedTeams.forEach((team, index) => {
            const x = index * (barWidth + spacing) + spacing/2;
            const barHeight = ((team.batting_avg || 0) / maxAvg) * chartHeight;
            const y = chartHeight - barHeight;
            const color = config.colors[index % config.colors.length];
            
            const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            bar.setAttribute('class', 'bar');
            bar.setAttribute('x', x);
            bar.setAttribute('width', barWidth);
            bar.setAttribute('fill', color);
            bar.style.cursor = 'pointer';
            bar.style.transition = 'opacity 0.3s ease';
            
            if (config.animation) {
                bar.setAttribute('y', chartHeight);
                bar.setAttribute('height', 0);
                setTimeout(() => {
                    bar.style.transition = 'all 0.8s ease';
                    bar.setAttribute('y', y);
                    bar.setAttribute('height', barHeight);
                }, index * 100);
            } else {
                bar.setAttribute('y', y);
                bar.setAttribute('height', barHeight);
            }
            
            bar.addEventListener('mouseover', (event) => {
                this.showTooltip(event, team.name, `.${((team.batting_avg || 0) * 1000).toFixed(0)} avg`);
                bar.style.opacity = '0.8';
            });
            bar.addEventListener('mouseout', () => {
                this.hideTooltip();
                bar.style.opacity = '1';
            });
            
            chartGroup.appendChild(bar);
        });
        
        this.addTeamLabels(chartGroup, sortedTeams, barWidth, spacing, chartHeight);
        this.addAxisLabels(chartGroup, chartWidth, chartHeight, 'Teams', 'Batting Average');
        
        this.container.appendChild(svg);
        this.currentChart = 'batting';
    }

    createRunsChart(teams, options = {}) {
        const config = { ...this.options, ...options };
        const sortedTeams = [...teams].sort((a, b) => (b.runs || 0) - (a.runs || 0));
        
        const { chartWidth, chartHeight, margin } = this.calculateDimensions(config);
        const maxRuns = Math.max(...sortedTeams.map(t => t.runs || 0), 1);
        const barWidth = chartWidth / sortedTeams.length * 0.8;
        const spacing = chartWidth / sortedTeams.length * 0.2;
        
        this.container.innerHTML = '';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', config.width);
        svg.setAttribute('height', config.height);
        svg.style.background = 'white';
        svg.style.borderRadius = '8px';
        
        const chartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        chartGroup.setAttribute('transform', `translate(${margin.left}, ${margin.top})`);
        svg.appendChild(chartGroup);
        
        this.addAxes(chartGroup, chartWidth, chartHeight);
        this.addYAxisLabels(chartGroup, chartHeight, maxRuns, 'runs');
        
        sortedTeams.forEach((team, index) => {
            const x = index * (barWidth + spacing) + spacing/2;
            const barHeight = ((team.runs || 0) / maxRuns) * chartHeight;
            const y = chartHeight - barHeight;
            const color = config.colors[index % config.colors.length];
            
            const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            bar.setAttribute('class', 'bar');
            bar.setAttribute('x', x);
            bar.setAttribute('width', barWidth);
            bar.setAttribute('fill', color);
            bar.style.cursor = 'pointer';
            bar.style.transition = 'opacity 0.3s ease';
            
            if (config.animation) {
                bar.setAttribute('y', chartHeight);
                bar.setAttribute('height', 0);
                setTimeout(() => {
                    bar.style.transition = 'all 0.8s ease';
                    bar.setAttribute('y', y);
                    bar.setAttribute('height', barHeight);
                }, index * 100);
            } else {
                bar.setAttribute('y', y);
                bar.setAttribute('height', barHeight);
            }
            
            bar.addEventListener('mouseover', (event) => {
                this.showTooltip(event, team.name, `${team.runs || 0} runs`);
                bar.style.opacity = '0.8';
            });
            bar.addEventListener('mouseout', () => {
                this.hideTooltip();
                bar.style.opacity = '1';
            });
            
            chartGroup.appendChild(bar);
        });
        
        this.addTeamLabels(chartGroup, sortedTeams, barWidth, spacing, chartHeight);
        this.addAxisLabels(chartGroup, chartWidth, chartHeight, 'Teams', 'Runs Scored');
        
        this.container.appendChild(svg);
        this.currentChart = 'runs';
    }

    createStandingsChart(teams, options = {}) {
        const config = { ...this.options, ...options };
        const teamsWithPct = teams.map(team => ({
            ...team,
            winPct: (team.wins || 0) / ((team.wins || 0) + (team.losses || 0)) || 0
        })).sort((a, b) => b.winPct - a.winPct);
        
        const { chartWidth, chartHeight, margin } = this.calculateDimensions(config);
        const barWidth = chartWidth / teamsWithPct.length * 0.8;
        const spacing = chartWidth / teamsWithPct.length * 0.2;
        
        this.container.innerHTML = '';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', config.width);
        svg.setAttribute('height', config.height);
        svg.style.background = 'white';
        svg.style.borderRadius = '8px';
        
        const chartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        chartGroup.setAttribute('transform', `translate(${margin.left}, ${margin.top})`);
        svg.appendChild(chartGroup);
        
        this.addAxes(chartGroup, chartWidth, chartHeight);
        this.addYAxisLabels(chartGroup, chartHeight, 1, 'percentage');
        
        teamsWithPct.forEach((team, index) => {
            const x = index * (barWidth + spacing) + spacing/2;
            const barHeight = team.winPct * chartHeight;
            const y = chartHeight - barHeight;
            const color = config.colors[index % config.colors.length];
            
            const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            bar.setAttribute('class', 'bar');
            bar.setAttribute('x', x);
            bar.setAttribute('width', barWidth);
            bar.setAttribute('fill', color);
            bar.style.cursor = 'pointer';
            bar.style.transition = 'opacity 0.3s ease';
            
            if (config.animation) {
                bar.setAttribute('y', chartHeight);
                bar.setAttribute('height', 0);
                setTimeout(() => {
                    bar.style.transition = 'all 0.8s ease';
                    bar.setAttribute('y', y);
                    bar.setAttribute('height', barHeight);
                }, index * 100);
            } else {
                bar.setAttribute('y', y);
                bar.setAttribute('height', barHeight);
            }
            
            bar.addEventListener('mouseover', (event) => {
                this.showTooltip(event, team.name, `${(team.winPct * 100).toFixed(1)}% win rate`);
                bar.style.opacity = '0.8';
            });
            bar.addEventListener('mouseout', () => {
                this.hideTooltip();
                bar.style.opacity = '1';
            });
            
            chartGroup.appendChild(bar);
        });
        
        this.addTeamLabels(chartGroup, teamsWithPct, barWidth, spacing, chartHeight);
        this.addAxisLabels(chartGroup, chartWidth, chartHeight, 'Teams', 'Win Percentage');
        
        this.container.appendChild(svg);
        this.currentChart = 'standings';
    }

    createPlayerChart(players, statField, chartTitle, options = {}) {
        const config = { ...this.options, ...options };
        
        const validPlayers = players.filter(p => (p[statField] || 0) > 0);
        const sortedPlayers = [...validPlayers].sort((a, b) => (b[statField] || 0) - (a[statField] || 0));
        
        if (sortedPlayers.length === 0) {
            this.showError(`No player data available for ${chartTitle}`);
            return;
        }
        
        const { chartWidth, chartHeight, margin } = this.calculateDimensions(config);
        const maxValue = Math.max(...sortedPlayers.map(p => p[statField] || 0));
        const barWidth = chartWidth / sortedPlayers.length * 0.8;
        const spacing = chartWidth / sortedPlayers.length * 0.2;
        
        this.container.innerHTML = '';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', config.width);
        svg.setAttribute('height', config.height);
        svg.style.background = 'white';
        svg.style.borderRadius = '8px';
        
        const chartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        chartGroup.setAttribute('transform', `translate(${margin.left}, ${margin.top})`);
        svg.appendChild(chartGroup);
        
        this.addAxes(chartGroup, chartWidth, chartHeight);
        this.addYAxisLabelsForPlayer(chartGroup, chartHeight, maxValue, statField);
        
        sortedPlayers.forEach((player, index) => {
            const x = index * (barWidth + spacing) + spacing/2;
            const barHeight = ((player[statField] || 0) / maxValue) * chartHeight;
            const y = chartHeight - barHeight;
            const color = config.colors[index % config.colors.length];
            
            const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            bar.setAttribute('class', 'bar');
            bar.setAttribute('x', x);
            bar.setAttribute('width', barWidth);
            bar.setAttribute('fill', color);
            bar.style.cursor = 'pointer';
            bar.style.transition = 'opacity 0.3s ease';
            
            if (config.animation) {
                bar.setAttribute('y', chartHeight);
                bar.setAttribute('height', 0);
                setTimeout(() => {
                    bar.style.transition = 'all 0.8s ease';
                    bar.setAttribute('y', y);
                    bar.setAttribute('height', barHeight);
                }, index * 100);
            } else {
                bar.setAttribute('y', y);
                bar.setAttribute('height', barHeight);
            }
            
            bar.addEventListener('mouseover', (event) => {
                const value = this.formatPlayerStatValue(player[statField], statField);
                this.showTooltip(event, player.name, value);
                bar.style.opacity = '0.8';
            });
            bar.addEventListener('mouseout', () => {
                this.hideTooltip();
                bar.style.opacity = '1';
            });
            
            chartGroup.appendChild(bar);
        });
        
        this.addPlayerLabels(chartGroup, sortedPlayers, barWidth, spacing, chartHeight);
        this.addAxisLabels(chartGroup, chartWidth, chartHeight, 'Players', this.getStatDisplayName(statField));
        
        this.container.appendChild(svg);
        this.currentChart = 'player-' + statField;
    }

    createPlayerRadialChart(player, playerName, viewType = 'season', options = {}) {
        const config = { ...this.options, ...options };
        
        // Use dynamic maximums if provided, otherwise use defaults
        const maxStats = options.maxStats || {
            battingAvg: 1.0,
            obp: 1.0,
            runs: Math.max(player.runs || 0, 50),
            acesBPI: Math.max(player.acesBPI || 0, 100),
            games: Math.max(player.games || 0, 25)
        };
        
        const stats = [
            { 
                key: 'battingAvg', 
                label: 'Batting Avg', 
                max: maxStats.battingAvg, 
                format: (v) => `.${Math.round(v * 1000).toString().padStart(3, '0')}` 
            },
            { 
                key: 'obp', 
                label: 'OBP', 
                max: maxStats.obp, 
                format: (v) => `.${Math.round(v * 1000).toString().padStart(3, '0')}` 
            },
            { 
                key: 'runs', 
                label: 'Runs', 
                max: maxStats.runs, 
                format: (v) => Math.round(v).toString() 
            },
            { 
                key: 'acesBPI', 
                label: 'AcesBPI', 
                max: maxStats.acesBPI, 
                format: (v) => v.toFixed(1) 
            },
            { 
                key: 'games', 
                label: 'Games', 
                max: maxStats.games, 
                format: (v) => Math.round(v).toString() 
            }
        ];
        
        const center = { x: config.width / 2, y: config.height / 2 + 40 };
        const radius = Math.min(config.width, config.height) / 2 - 120;
        const angleStep = (2 * Math.PI) / stats.length;
        
        this.container.innerHTML = '';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', config.width);
        svg.setAttribute('height', config.height);
        svg.style.background = 'white';
        svg.style.borderRadius = '8px';
        
        const chartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        svg.appendChild(chartGroup);
        
        const gridLevels = 5;
        for (let i = 1; i <= gridLevels; i++) {
            const gridRadius = (radius * i) / gridLevels;
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', center.x);
            circle.setAttribute('cy', center.y);
            circle.setAttribute('r', gridRadius);
            circle.setAttribute('fill', 'none');
            circle.setAttribute('stroke', '#e1e5e9');
            circle.setAttribute('stroke-width', 1);
            chartGroup.appendChild(circle);
        }
        
        stats.forEach((stat, index) => {
            const angle = index * angleStep - Math.PI / 2;
            const x1 = center.x;
            const y1 = center.y;
            const x2 = center.x + radius * Math.cos(angle);
            const y2 = center.y + radius * Math.sin(angle);
            
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            line.setAttribute('stroke', '#e1e5e9');
            line.setAttribute('stroke-width', 1);
            chartGroup.appendChild(line);
            
            const labelDistance = radius + 20;
            const labelX = center.x + labelDistance * Math.cos(angle);
            const labelY = center.y + labelDistance * Math.sin(angle);
            
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', labelX);
            label.setAttribute('y', labelY);
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('dominant-baseline', 'middle');
            label.setAttribute('font-size', '12px');
            label.setAttribute('font-weight', '600');
            label.setAttribute('fill', '#333');
            label.textContent = stat.label;
            chartGroup.appendChild(label);
            
            // Add max value labels for context
            const maxLabelY = labelY + (labelY > center.y ? 15 : -15);
            const maxLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            maxLabel.setAttribute('x', labelX);
            maxLabel.setAttribute('y', maxLabelY);
            maxLabel.setAttribute('text-anchor', 'middle');
            maxLabel.setAttribute('dominant-baseline', 'middle');
            maxLabel.setAttribute('font-size', '10px');
            maxLabel.setAttribute('fill', '#999');
            maxLabel.textContent = `(max: ${stat.format(stat.max)})`;
            chartGroup.appendChild(maxLabel);
        });
        
        const dataPoints = stats.map((stat, index) => {
            const value = player[stat.key] || 0;
            const normalizedValue = Math.min(value / stat.max, 1);
            const angle = index * angleStep - Math.PI / 2;
            const distance = radius * normalizedValue;
            
            return {
                x: center.x + distance * Math.cos(angle),
                y: center.y + distance * Math.sin(angle),
                value: value,
                stat: stat
            };
        });
        
        const pathData = dataPoints.map((point, index) => {
            return `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`;
        }).join(' ') + ' Z';
        
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        polygon.setAttribute('d', pathData);
        polygon.setAttribute('fill', 'rgba(102, 126, 234, 0.3)');
        polygon.setAttribute('stroke', '#667eea');
        polygon.setAttribute('stroke-width', 2);
        chartGroup.appendChild(polygon);
        
        dataPoints.forEach((point, index) => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', point.x);
            circle.setAttribute('cy', point.y);
            circle.setAttribute('r', 4);
            circle.setAttribute('fill', '#667eea');
            circle.setAttribute('stroke', 'white');
            circle.setAttribute('stroke-width', 2);
            circle.style.cursor = 'pointer';
            
            circle.addEventListener('mouseover', (event) => {
                const formattedValue = point.stat.format(point.value);
                const percentage = ((point.value / point.stat.max) * 100).toFixed(1);
                this.showTooltip(event, point.stat.label, `${formattedValue} (${percentage}% of max)`);
            });
            circle.addEventListener('mouseout', () => {
                this.hideTooltip();
            });
            
            chartGroup.appendChild(circle);
        });
        
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        title.setAttribute('x', center.x);
        title.setAttribute('y', 30);
        title.setAttribute('text-anchor', 'middle');
        title.setAttribute('font-size', '16px');
        title.setAttribute('font-weight', '700');
        title.setAttribute('fill', '#333');
        title.textContent = `${playerName} - ${viewType === 'career' ? 'Career' : 'Season'} Stats`;
        chartGroup.appendChild(title);
        
        // Add subtitle showing the scaling context with proper spacing
        const subtitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        subtitle.setAttribute('x', center.x);
        subtitle.setAttribute('y', 50);
        subtitle.setAttribute('text-anchor', 'middle');
        subtitle.setAttribute('font-size', '12px');
        subtitle.setAttribute('fill', '#666');
        subtitle.textContent = `Scaled relative to ${viewType === 'career' ? 'all-time' : 'season'} maximums`;
        chartGroup.appendChild(subtitle);
        
        this.container.appendChild(svg);
        this.currentChart = 'radial-' + viewType;
    }

    calculateDimensions(config) {
        return {
            chartWidth: config.width - config.margin.left - config.margin.right,
            chartHeight: config.height - config.margin.top - config.margin.bottom,
            margin: config.margin
        };
    }

    addAxes(chartGroup, chartWidth, chartHeight) {
        const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        yAxis.setAttribute('x1', 0);
        yAxis.setAttribute('y1', 0);
        yAxis.setAttribute('x2', 0);
        yAxis.setAttribute('y2', chartHeight);
        yAxis.setAttribute('stroke', '#e1e5e9');
        yAxis.setAttribute('stroke-width', 2);
        chartGroup.appendChild(yAxis);
        
        const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        xAxis.setAttribute('x1', 0);
        xAxis.setAttribute('y1', chartHeight);
        xAxis.setAttribute('x2', chartWidth);
        xAxis.setAttribute('y2', chartHeight);
        xAxis.setAttribute('stroke', '#e1e5e9');
        xAxis.setAttribute('stroke-width', 2);
        chartGroup.appendChild(xAxis);
    }

    addYAxisLabels(chartGroup, chartHeight, maxValue, type) {
        let labels = [];
        
        switch(type) {
            case 'wins':
            case 'runs':
                const increment = type === 'runs' ? Math.max(Math.ceil(maxValue / 10), 5) : Math.max(Math.ceil(maxValue / 5), 1);
                for (let i = 0; i <= maxValue; i += increment) {
                    labels.push({ value: i, text: i.toString() });
                }
                break;
            case 'batting':
                for (let i = 0; i <= 10; i++) {
                    const avg = i * 0.05;
                    if (avg <= maxValue + 0.05) {
                        labels.push({ value: avg, text: `.${Math.round(avg * 1000).toString().padStart(3, '0')}` });
                    }
                }
                break;
            case 'percentage':
                for (let i = 0; i <= 10; i++) {
                    const pct = i * 0.1;
                    labels.push({ value: pct, text: `${Math.round(pct * 100)}%` });
                }
                break;
        }
        
        labels.forEach(label => {
            const y = chartHeight - (label.value / maxValue) * chartHeight;
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', -10);
            text.setAttribute('y', y + 5);
            text.setAttribute('text-anchor', 'end');
            text.setAttribute('font-size', '12px');
            text.setAttribute('fill', '#666');
            text.textContent = label.text;
            chartGroup.appendChild(text);
            
            const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            tick.setAttribute('x1', -5);
            tick.setAttribute('y1', y);
            tick.setAttribute('x2', 5);
            tick.setAttribute('y2', y);
            tick.setAttribute('stroke', '#e1e5e9');
            chartGroup.appendChild(tick);
        });
    }

    addYAxisLabelsForPlayer(chartGroup, chartHeight, maxValue, statField) {
        let labels = [];
        
        switch(statField) {
            case 'battingAvg':
            case 'obp':
                for (let i = 0; i <= Math.ceil(maxValue / 0.05); i++) {
                    const value = i * 0.05;
                    if (value <= maxValue + 0.05) {
                        labels.push({ 
                            value: value, 
                            text: `.${Math.round(value * 1000).toString().padStart(3, '0')}` 
                        });
                    }
                }
                break;
            case 'runs':
                const runIncrement = Math.max(Math.ceil(maxValue / 10), 1);
                for (let i = 0; i <= maxValue; i += runIncrement) {
                    labels.push({ value: i, text: i.toString() });
                }
                break;
            case 'acesBPI':
                const bpiIncrement = Math.max(Math.ceil(maxValue / 10), 0.5);
                for (let i = 0; i <= maxValue; i += bpiIncrement) {
                    labels.push({ value: i, text: i.toFixed(1) });
                }
                break;
        }
        
        labels.forEach(label => {
            const y = chartHeight - (label.value / maxValue) * chartHeight;
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', -10);
            text.setAttribute('y', y + 5);
            text.setAttribute('text-anchor', 'end');
            text.setAttribute('font-size', '12px');
            text.setAttribute('fill', '#666');
            text.textContent = label.text;
            chartGroup.appendChild(text);
            
            const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            tick.setAttribute('x1', -5);
            tick.setAttribute('y1', y);
            tick.setAttribute('x2', 5);
            tick.setAttribute('y2', y);
            tick.setAttribute('stroke', '#e1e5e9');
            chartGroup.appendChild(tick);
        });
    }

    addTeamLabels(chartGroup, teams, barWidth, spacing, chartHeight) {
        teams.forEach((team, index) => {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', index * (barWidth + spacing) + spacing/2 + barWidth/2);
            text.setAttribute('y', chartHeight + 25);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-size', '14px');
            text.setAttribute('font-weight', '600');
            text.setAttribute('fill', this.getTeamColor(team.name));
            text.textContent = (team.name || '').replace('Aces ', '');
            chartGroup.appendChild(text);
        });
    }

    addPlayerLabels(chartGroup, players, barWidth, spacing, chartHeight) {
        players.forEach((player, index) => {
            const x = index * (barWidth + spacing) + spacing/2 + barWidth/2;
            const y = chartHeight + 25;
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x);
            text.setAttribute('y', y);
            text.setAttribute('text-anchor', 'start');
            text.setAttribute('font-size', '12px');
            text.setAttribute('font-weight', '600');
            text.setAttribute('fill', '#666');
            text.setAttribute('transform', `rotate(45, ${x}, ${y})`);
            const lastName = player.name.split(' ').pop();
            text.textContent = lastName;
            chartGroup.appendChild(text);
        });
    }

    getTeamColor(teamName) {
        const cleanName = teamName.replace('Aces ', '').toLowerCase().trim();
        
        const teamColors = {
            'black': '#1a1a1a',
            'green': '#2d7d32', 
            'red': '#d32f2f',
            'blue': '#1976d2',
            'white': '#343a40',
            'orange': '#f57c00',
            'silver': '#757575',
            'purple': '#7b1fa2',
            'gold': '#f57f17',
            'carolina': '#4b9cd3',
            'army': '#654321'
        };
        
        return teamColors[cleanName] || '#666';
    }

    addAxisLabels(chartGroup, chartWidth, chartHeight, xLabel, yLabel) {
        const xLabelElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        xLabelElement.setAttribute('x', chartWidth/2);
        xLabelElement.setAttribute('y', chartHeight + 70);
        xLabelElement.setAttribute('text-anchor', 'middle');
        xLabelElement.setAttribute('font-size', '14px');
        xLabelElement.setAttribute('font-weight', '600');
        xLabelElement.setAttribute('fill', '#333');
        xLabelElement.textContent = xLabel;
        chartGroup.appendChild(xLabelElement);
        
        const yLabelElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        yLabelElement.setAttribute('x', -30);
        yLabelElement.setAttribute('y', chartHeight/2);
        yLabelElement.setAttribute('text-anchor', 'middle');
        yLabelElement.setAttribute('font-size', '14px');
        yLabelElement.setAttribute('font-weight', '600');
        yLabelElement.setAttribute('fill', '#333');
        yLabelElement.setAttribute('transform', `rotate(-90, -30, ${chartHeight/2})`);
        yLabelElement.textContent = yLabel;
        chartGroup.appendChild(yLabelElement);
    }

    formatPlayerStatValue(value, statField) {
        switch(statField) {
            case 'battingAvg':
            case 'obp':
                return `.${Math.round(value * 1000).toString().padStart(3, '0')}`;
            case 'runs':
                return `${value} runs`;
            case 'acesBPI':
                return `${value.toFixed(2)} BPI`;
            default:
                return value.toString();
        }
    }

    getStatDisplayName(statField) {
        const names = {
            'battingAvg': 'Batting Average',
            'obp': 'On-Base Percentage', 
            'runs': 'Runs Scored',
            'acesBPI': 'AcesBPI'
        };
        return names[statField] || statField;
    }

    createTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'chart-tooltip';
        this.tooltip.style.position = 'absolute';
        this.tooltip.style.background = 'rgba(0,0,0,0.8)';
        this.tooltip.style.color = 'white';
        this.tooltip.style.padding = '8px 12px';
        this.tooltip.style.borderRadius = '6px';
        this.tooltip.style.fontSize = '12px';
        this.tooltip.style.pointerEvents = 'none';
        this.tooltip.style.zIndex = '1000';
        this.tooltip.style.opacity = '0';
        this.tooltip.style.transition = 'opacity 0.3s ease';
        document.body.appendChild(this.tooltip);
    }

    showTooltip(event, teamName, value) {
        this.tooltip.style.left = (event.pageX + 10) + 'px';
        this.tooltip.style.top = (event.pageY - 10) + 'px';
        this.tooltip.innerHTML = `<strong>${teamName}</strong><br/>${value}`;
        this.tooltip.style.opacity = '1';
    }

    hideTooltip() {
        this.tooltip.style.opacity = '0';
    }

    setupResizeHandler() {
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (this.currentChart) {
                    const teams = this.data ? this.data.teams || [] : [];
                    if (teams.length > 0) {
                        this.updateChart(teams, this.currentChart);
                    }
                }
            }, 250);
        });
    }

    showError(message) {
        this.container.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: #dc3545;">
                <h3>Error Loading Chart</h3>
                <p>${message}</p>
            </div>
        `;
    }

    updateChart(newData, chartType = 'wins') {
        this.data = { teams: newData };
        
        switch(chartType) {
            case 'wins':
                this.createWinsChart(newData);
                break;
            case 'batting':
                this.createBattingChart(newData);
                break;
            case 'runs':
                this.createRunsChart(newData);
                break;
            case 'standings':
                this.createStandingsChart(newData);
                break;
            default:
                console.warn('Unknown chart type:', chartType);
        }
    }

    destroy() {
        if (this.tooltip && this.tooltip.parentNode) {
            this.tooltip.parentNode.removeChild(this.tooltip);
        }
        this.container.innerHTML = '';
        this.data = null;
        this.currentChart = null;
    }
}

if (typeof window !== 'undefined') {
    window.TeamCharts = TeamCharts;
}