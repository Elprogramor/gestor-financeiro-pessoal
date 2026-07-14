/**
 * Adaptador do Chart.js.
 * Mantém instâncias, cores do tema e configurações consistentes.
 */

import { finance } from "./finance.js";
import { storage } from "./storage.js";
import { getMonthYearLabel } from "./utils.js";

class ChartsService {
  #instances = new Map();

  get available() {
    return typeof globalThis.Chart !== "undefined";
  }

  destroy(id) {
    const chart = this.#instances.get(id);
    if (chart) chart.destroy();
    this.#instances.delete(id);
  }

  destroyAll() {
    this.#instances.forEach((chart) => chart.destroy());
    this.#instances.clear();
  }

  renderDashboard(canvasId, series) {
    const labels = series.map((item) => getMonthYearLabel(item.date, storage.getSettings().locale));
    return this.create(canvasId, {
      type: "line",
      data: {
        labels,
        datasets: [
          this.dataset("Receitas", series.map((item) => item.income), "success", { fill: false }),
          this.dataset("Despesas", series.map((item) => item.expenses), "danger", { fill: false }),
          this.dataset("Lucro", series.map((item) => item.profit), "primary", { fill: false, borderDash: [5, 4] })
        ]
      },
      options: this.options({ currency: true, legend: false })
    });
  }

  renderCashflow(canvasId, transactions) {
    const chronological = finance.getCashflow(transactions).reverse();
    return this.create(canvasId, {
      type: "line",
      data: {
        labels: chronological.map((item) => item.date),
        datasets: [this.dataset("Saldo", chronological.map((item) => item.balanceAfter), "primary", { fill: true, tension: .28 })]
      },
      options: this.options({ currency: true, legend: false })
    });
  }

  renderExpensePie(canvasId, breakdown) {
    const colors = this.palette(Math.max(1, breakdown.length));
    return this.create(canvasId, {
      type: "doughnut",
      data: {
        labels: breakdown.map((item) => item.category),
        datasets: [{ data: breakdown.map((item) => item.value), backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }]
      },
      options: this.options({ currency: true, legend: true, scales: false, cutout: "68%" })
    });
  }

  renderMonthlyBar(canvasId, series) {
    return this.create(canvasId, {
      type: "bar",
      data: {
        labels: series.map((item) => getMonthYearLabel(item.date, storage.getSettings().locale)),
        datasets: [
          this.dataset("Receitas", series.map((item) => item.income), "success", { backgroundOnly: true }),
          this.dataset("Despesas", series.map((item) => item.expenses), "danger", { backgroundOnly: true })
        ]
      },
      options: this.options({ currency: true, legend: true })
    });
  }

  renderProfitArea(canvasId, series) {
    return this.create(canvasId, {
      type: "line",
      data: {
        labels: series.map((item) => getMonthYearLabel(item.date, storage.getSettings().locale)),
        datasets: [this.dataset("Lucro", series.map((item) => item.profit), "primary", { fill: true, tension: .32 })]
      },
      options: this.options({ currency: true, legend: false })
    });
  }

  renderOrigins(canvasId, breakdown) {
    return this.create(canvasId, {
      type: "bar",
      data: {
        labels: breakdown.map((item) => item.origin),
        datasets: [this.dataset("Receita", breakdown.map((item) => item.value), "primary", { backgroundOnly: true, borderRadius: 7 })]
      },
      options: this.options({ currency: true, legend: false, indexAxis: "y" })
    });
  }

  renderYearly(canvasId, series) {
    return this.create(canvasId, {
      type: "bar",
      data: {
        labels: series.map((item) => item.year),
        datasets: [
          this.dataset("Receitas", series.map((item) => item.income), "success", { backgroundOnly: true }),
          this.dataset("Despesas", series.map((item) => item.expenses), "danger", { backgroundOnly: true }),
          this.dataset("Lucro", series.map((item) => item.profit), "primary", { backgroundOnly: true })
        ]
      },
      options: this.options({ currency: true, legend: true })
    });
  }

  create(canvasId, configuration) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !this.available) {
      const wrapper = canvas?.parentElement;
      if (wrapper) wrapper.innerHTML = '<div class="empty-state"><div class="empty-state__icon">!</div><h3>Gráfico indisponível</h3><p>Os dados continuam acessíveis nas tabelas e indicadores.</p></div>';
      return null;
    }
    this.destroy(canvasId);
    this.applyDefaults();
    const chart = new Chart(canvas.getContext("2d"), configuration);
    this.#instances.set(canvasId, chart);
    return chart;
  }

  dataset(label, data, colorName, options = {}) {
    const color = this.color(colorName);
    const fillColor = this.alpha(color, .13);
    const common = {
      label,
      data,
      borderColor: color,
      backgroundColor: options.backgroundOnly ? this.alpha(color, .82) : fillColor,
      pointBackgroundColor: color,
      pointBorderColor: this.color("surface"),
      pointBorderWidth: 2,
      pointRadius: data.length > 16 ? 0 : 3,
      pointHoverRadius: 5,
      borderWidth: options.backgroundOnly ? 0 : 2,
      borderRadius: options.borderRadius ?? 5,
      maxBarThickness: 34,
      tension: options.tension ?? .28,
      fill: options.fill ?? false,
      borderDash: options.borderDash || []
    };
    return common;
  }

  options({ currency = false, legend = true, scales = true, cutout, indexAxis = "x" } = {}) {
    const settings = storage.getSettings();
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 650, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      indexAxis,
      cutout,
      plugins: {
        legend: {
          display: legend,
          position: "bottom",
          labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 6, boxHeight: 6, padding: 18, color: this.color("textSoft"), font: { size: 10, family: "Inter" } }
        },
        tooltip: {
          backgroundColor: this.color("text"),
          titleColor: this.color("surface"),
          bodyColor: this.color("surface"),
          padding: 11,
          cornerRadius: 8,
          displayColors: true,
          callbacks: currency ? {
            label: (context) => `${context.dataset.label || context.label}: ${new Intl.NumberFormat(settings.locale, { style: "currency", currency: settings.currency }).format(context.parsed.y ?? context.parsed.x ?? context.raw)}`
          } : {}
        }
      }
    };
    if (scales) {
      options.scales = {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: this.color("textFaint"), font: { size: 9, family: "Inter" }, maxRotation: 0 } },
        y: {
          beginAtZero: true,
          grid: { color: this.alpha(this.color("border"), .75), drawTicks: false },
          border: { display: false },
          ticks: {
            color: this.color("textFaint"),
            padding: 8,
            font: { size: 9, family: "Inter" },
            callback: currency ? (value) => new Intl.NumberFormat(settings.locale, { notation: "compact", style: "currency", currency: settings.currency, maximumFractionDigits: 1 }).format(value) : undefined
          }
        }
      };
      if (indexAxis === "y") {
        options.scales.x.ticks.callback = currency ? (value) => new Intl.NumberFormat(settings.locale, { notation: "compact", style: "currency", currency: settings.currency, maximumFractionDigits: 1 }).format(value) : undefined;
        delete options.scales.y.ticks.callback;
      }
    }
    return options;
  }

  applyDefaults() {
    if (!this.available) return;
    Chart.defaults.font.family = "Inter, sans-serif";
    Chart.defaults.color = this.color("textSoft");
  }

  color(name) {
    const styles = getComputedStyle(document.documentElement);
    const map = {
      primary: "--primary",
      success: "--success",
      danger: "--danger",
      warning: "--warning",
      info: "--info",
      surface: "--surface",
      text: "--text",
      textSoft: "--text-soft",
      textFaint: "--text-faint",
      border: "--border"
    };
    return styles.getPropertyValue(map[name] || map.primary).trim() || "#635bff";
  }

  alpha(color, opacity) {
    if (color.startsWith("rgb")) return color.replace("rgb(", "rgba(").replace(")", `, ${opacity})`);
    const hex = color.replace("#", "");
    if (hex.length !== 6) return color;
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  palette(count) {
    const base = [this.color("primary"), this.color("success"), this.color("danger"), this.color("warning"), this.color("info"), "#9b59b6", "#2d9cdb", "#e67e22", "#16a085", "#c0392b"];
    return Array.from({ length: count }, (_, index) => this.alpha(base[index % base.length], .85));
  }
}

export const charts = new ChartsService();
