/// <reference types="cypress"/>
/// <reference types="../../support"/>

import faker from "faker";

import {
  BUTTON_SELECTORS,
  ORDERS_SELECTORS,
  SHARED_ELEMENTS,
} from "../../elements/";
import { urlList } from "../../fixtures/urlList";
import {
  createCustomer,
  updateOrdersSettings,
} from "../../support/api/requests/";
import {
  createShipping,
  createUnconfirmedOrder,
  getDefaultChannel,
} from "../../support/api/utils/";
import * as productsUtils from "../../support/api/utils/products/productsUtils";
import {
  ensureCanvasStatic,
} from "../../support/customCommands/sharedElementsOperations/canvas";
import {
  finalizeDraftOrder,
  selectChannelInPicker,
} from "../../support/pages/";

describe("Draft orders", () => {
  const startsWith = "CyDraftOrders-";
  const randomName = startsWith + faker.datatype.number();
  let customer;
  let defaultChannel;
  let warehouse;
  let address;
  let variantsList;
  let shippingMethod;

  before(() => {
    cy.loginUserViaRequest();
    updateOrdersSettings();
    getDefaultChannel()
      .then(channel => {
        defaultChannel = channel;
      })
      .then(() => {
        cy.fixture("addresses");
      })
      .then(addresses => {
        address = addresses.plAddress;
        createCustomer(
          `${randomName}@example.com`,
          randomName,
          addresses.plAddress,
          true,
        ).then(customerResp => {
          customer = customerResp.user;
        });
        createShipping({
          channelId: defaultChannel.id,
          name: randomName,
          address: addresses.plAddress,
        });
      })
      .then(
        ({ warehouse: warehouseResp, shippingMethod: shippingMethodResp }) => {
          warehouse = warehouseResp;
          shippingMethod = shippingMethodResp;

          productsUtils.createTypeAttributeAndCategoryForProduct({
            name: randomName,
          });
        },
      )
      .then(
        ({
          productType: productTypeResp,
          attribute: attributeResp,
          category: categoryResp,
        }) => {
          productsUtils.createProductInChannel({
            name: randomName,
            channelId: defaultChannel.id,
            warehouseId: warehouse.id,
            productTypeId: productTypeResp.id,
            attributeId: attributeResp.id,
            categoryId: categoryResp.id,
          });
        },
      )
      .then(({ variantsList: variantsResp, product }) => {
        variantsList = variantsResp;
        cy.checkIfDataAreNotNull({ defaultChannel, warehouse, address });
      });
  });

  beforeEach(() => {
    cy.loginUserViaRequest();
  });

  it(
    "should move draft order to orders. TC: SALEOR_2103",
    { tags: ["@orders", "@allEnv"] },
    () => {
      let draftOrderNumber;
      cy.addAliasToGraphRequest("OrderDraftFinalize");
      cy.addAliasToGraphRequest("OrderList");

      cy.visit(urlList.orders);
      cy.get(ORDERS_SELECTORS.createOrderButton).click();
      selectChannelInPicker(defaultChannel.name);
      finalizeDraftOrder(randomName, address)
        .wait("@OrderDraftFinalize")
        .then(finalizedDraftOrderResponse => {
          cy.log(finalizedDraftOrderResponse);
          draftOrderNumber =
            finalizedDraftOrderResponse.response.body.data.draftOrderComplete
              .order.number;
          cy.get(SHARED_ELEMENTS.pageHeader).should(
            "contain.text",
            draftOrderNumber,
          );
          cy.get(BUTTON_SELECTORS.back)
            .click()
            .waitForRequestAndCheckIfNoErrors("@OrderList");
          cy.visit(urlList.draftOrders).then(() => {
            cy.url().should("include", urlList.draftOrders);
            ensureCanvasStatic(SHARED_ELEMENTS.dataGridTable);
            cy.contains(draftOrderNumber).should("not.exist");
          });
        });
    },
  );

  it(
    "should be able to turn of all but one static columns on draft orders detail. TC: SALEOR_2135",
    { tags: ["@orders", "@allEnv", "@stable"] },
    () => {
      let order;
      createUnconfirmedOrder({
        customerId: customer.id,
        channelId: defaultChannel.id,
        shippingMethod,
        variantsList,
        address,
        warehouse: warehouse.id,
      }).then(({ order: orderResp }) => {
        order = orderResp;
        cy.visit(urlList.orders + `${order.id}`);
        cy.openColumnPicker();
        cy.get(SHARED_ELEMENTS.staticColumnContainer)
          .should("contain.text", "Product")
          .should("contain.text", "SKU")
          .should("contain.text", "Variant")
          .should("contain.text", "Quantity")
          .should("contain.text", "Price")
          .should("contain.text", "Total")
          .should("contain.text", "Status");
        // switching off all but one static columns
        cy.get(SHARED_ELEMENTS.gridStaticSkuButton).click();
        cy.get(SHARED_ELEMENTS.gridStaticVariantNameButton).click();
        cy.get(SHARED_ELEMENTS.gridStaticQuantityButton).click();
        cy.get(SHARED_ELEMENTS.gridStaticPriceButton).click();
        cy.get(SHARED_ELEMENTS.gridStaticTotalButton).click();
        cy.get(SHARED_ELEMENTS.gridStaticStatusButton).click();
        cy.get(SHARED_ELEMENTS.gridStaticProductButton).should(
          "have.attr",
          "data-state",
          "on",
        );
        cy.get(SHARED_ELEMENTS.dataGridTable)
          .find("th")
          // on draft first th is empty so length need to be 2
          .should("have.length", 2)
          .last()
          .should("have.text", "Product");
        //next line hides picker
        cy.get(SHARED_ELEMENTS.pageHeader).click({ force: true });
        cy.get(SHARED_ELEMENTS.dynamicColumnContainer).should("not.exist");
      });
    },
  );
});
