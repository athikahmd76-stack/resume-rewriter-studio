/**
 * Fictional demo data.
 *
 * EVERYTHING here is invented for demonstration purposes and clearly labelled as
 * fictional: the person, the companies, the certifications and the metrics do
 * not refer to any real individual or organisation.
 */

export const DEMO_NOTICE = 'Fictional demo content. "Aarav Mehta" and "Northwind Retail Group" are invented for this demo.';

export const DEMO_FILE = {
  name: 'demo-resume-aarav-mehta.docx',
  size: 24_820,
  type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** A DOCX-shaped parsed document (same structure parseDocx() returns). */
export const DEMO_PARSED = {
  kind: 'docx',
  pageCount: 2,
  text: '',
  blocks: [
    { type: 'paragraph', text: 'Aarav Mehta', fontSize: 20, bold: true, align: 'center', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'Supply Chain Analyst', fontSize: 11, bold: true, align: 'center', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'aarav.mehta.demo@example.com  |  +44 7700 900123  |  Manchester, UK  |  linkedin.com/in/aarav-mehta-demo', fontSize: 9, bold: false, align: 'center', bullet: false, marker: null, level: 0 },

    { type: 'paragraph', text: 'Professional Summary', fontSize: 12, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'Supply chain analyst with 6 years of experience in retail distribution. Responsible for demand planning, inventory optimization and purchasing for 42 stores. Skilled in SAP MM and Excel.', fontSize: 10, bold: false, align: 'left', bullet: false, marker: null, level: 0 },

    { type: 'paragraph', text: 'Professional Experience', fontSize: 12, bold: true, align: 'left', bullet: false, marker: null, level: 0 },

    { type: 'paragraph', text: 'Supply Chain Analyst  |  Northwind Retail Group  |  Manchester, UK  |  Mar 2021 - Present', fontSize: 10.5, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'bullet', text: 'Responsible for demand planning and purchasing for 42 retail stores, covering 11,400 active SKUs.', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },
    { type: 'bullet', text: 'Improved outward accuracy to 90% by introducing weekly allocation reviews.', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },
    { type: 'bullet', text: 'Worked on the implementation of SAP S/4HANA materials management with a team of 6 analysts.', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },
    { type: 'bullet', text: 'Built Power BI dashboards for stock availability and replenishment performance.', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },
    { type: 'bullet', text: 'Helped with the annual category review, reducing slow-moving stock by 14%.', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },
    { type: 'bullet', text: 'Managed the third-party logistics supplier scorecard across 4 carriers.', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },

    { type: 'paragraph', text: 'Inventory Analyst  |  Cobalt Distribution Ltd  |  Leeds, UK  |  Jun 2019 - Feb 2021', fontSize: 10.5, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'bullet', text: 'Handled stock reconciliation across 3 warehouses and resolved 96% of cycle count variances within one week.', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },
    { type: 'bullet', text: 'Did reporting on inventory turns and ageing, improving inventory turns from 5.1 to 6.4.', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },
    { type: 'bullet', text: 'Assisted with supplier negotiations for packaging, saving GBP 85,000 annually.', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },
    { type: 'bullet', text: 'Coordinated weekly replenishment meetings with buying, store operations and logistics.', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },

    { type: 'paragraph', text: 'Supply Chain Graduate  |  Brightpath Logistics  |  Sheffield, UK  |  Sep 2017 - May 2019', fontSize: 10.5, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'bullet', text: 'Supported month-end stock reporting for 2 distribution centres.', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },
    { type: 'bullet', text: 'Used Excel pivot tables to analyse supplier lead time variance by category.', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },

    { type: 'paragraph', text: 'Education', fontSize: 12, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'BSc (Hons) Supply Chain Management  |  University of Leeds  |  2015 - 2019', fontSize: 10.5, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'bullet', text: 'Final year dissertation on inventory optimisation in multi-channel retail.', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },

    { type: 'paragraph', text: 'Skills', fontSize: 12, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'Supply chain: Demand planning, inventory optimization, procurement, distribution planning', fontSize: 10, bold: false, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'Systems: SAP MM, SAP S/4HANA, Excel (advanced), Power BI', fontSize: 10, bold: false, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'Professional: Stakeholder management, process mapping, root cause analysis', fontSize: 10, bold: false, align: 'left', bullet: false, marker: null, level: 0 },

    { type: 'paragraph', text: 'Certifications', fontSize: 12, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'bullet', text: 'APICS Certified Supply Chain Professional (CSCP), 2021', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },
    { type: 'bullet', text: 'Lean Six Sigma Green Belt, 2020', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },

    { type: 'paragraph', text: 'Languages', fontSize: 12, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'bullet', text: 'English (native), Hindi (fluent), Gujarati (conversational)', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },
  ],
  tables: [],
  pageSize: 'A4',
  pageSizePt: { width: 595.28, height: 841.89 },
  orientation: 'portrait',
  columns: 1,
  margins: { top: 54, right: 54, bottom: 54, left: 54, header: 28, footer: 28 },
  defaultFontSize: 10,
  fontFamily: 'Calibri',
  fontSamples: [],
  bulletMarkers: ['\u2022'],
  knownBulletGlyph: '\u2022',
  fallback: false,
};

DEMO_PARSED.text = DEMO_PARSED.blocks.map((b) => b.text).join('\n');

export const DEMO_JD = `Supply Chain Analyst - Manchester (Hybrid)

About the role
We are looking for a Supply Chain Analyst to join our regional distribution team. You will own demand planning and inventory optimisation for a network of retail stores, and partner closely with buying, store operations and logistics.

Responsibilities
- Own demand planning and forecast accuracy for 40+ stores
- Manage inventory optimisation, including stock ageing and working capital reduction
- Run purchasing and supplier performance reviews with our 3PL partners
- Produce weekly stock availability and replenishment reporting
- Support the SAP S/4HANA roadmap for materials management
- Improve allocation and outward tracking processes to strengthen distribution visibility

Requirements
- 3+ years of experience in supply chain, demand planning or inventory management
- Strong Excel capability (pivot tables, lookups) and experience building dashboards
- Experience with SAP MM or SAP S/4HANA is highly desirable
- Working knowledge of Power BI for management reporting
- Excellent stakeholder management and communication
- APICS CPIM or CSCP certification preferred

Nice to have
- Experience with SQL for data extraction
- Familiarity with process mapping and root cause analysis
- Python exposure for automation of repetitive reporting tasks

We offer a competitive package, hybrid working and a structured development plan.`;

export const DEMO_KEYWORDS = [
  'Demand Planning',
  'Inventory Optimization',
  'SAP S/4HANA',
  'Procurement',
  'Power BI',
  'Forecasting',
  'Supplier Management',
  'Process Mapping',
];

export const DEMO_ROLE = 'Supply Chain Analyst';

export default { DEMO_PARSED, DEMO_JD, DEMO_KEYWORDS, DEMO_ROLE, DEMO_FILE, DEMO_NOTICE };
