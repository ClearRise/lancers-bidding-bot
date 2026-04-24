export const selectors = {
  taskCard: ".p-search-job-media",
  taskTitleLink: 'a.p-search-job-media__title[href*="/work/detail/"]',
  taskPriceBlock: ".p-search-job-media__price",
  taskPriceNumber: ".p-search-job-media__number",
  detailTitle: "h1",
  detailDescription:
    ".p-work-detail__content, .c-content, .p-workdetail__body, article, main",
  detailBudget:
    ".p-work-detail__price, .p-work-detail__budget, .p-workdetail__price, [class*='budget']",
  ndaAgreementCheckbox: "#ProposalIsAgreement",
  proposalEstimateTextarea: "#ProposalEstimate",
  proposalDescriptionTextarea: "#ProposalDescription",
  estimateDeliverDateInput: ".react-datepicker__input-container input",
  estimatePriceInput: ".css-zjik7 input[type='number']",
  submitButton: "#form_end, input[name='send'][type='submit'], button[type='submit']",
};
